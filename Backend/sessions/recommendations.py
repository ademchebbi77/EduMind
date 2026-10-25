"""Recommandation de sessions en ligne, entièrement locale.

Le profil de l'étudiant est construit à partir de ses inscriptions, de ses
tentatives de quiz et de ses demandes de formation. Chaque texte est vectorisé
en TF-IDF puis comparé aux sessions à venir par similarité cosinus ; le score
final combine ce recouvrement sémantique avec quelques signaux explicites
(même cours, même type, popularité, imminence).

Aucun service externe n'est appelé et aucun modèle n'a besoin d'être entraîné :
l'endpoint reste utile dès la première inscription.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field

from django.utils import timezone

from announcements.models import AnnouncementEnrollment
from assessments.models import QuizAttempt

from .models import LiveSession, SessionEnrollment

_TOKEN_PATTERN = re.compile(r"[a-z0-9]+")

_STOPWORDS = frozenset(
    """
    au aux avec ce ces cet cette dans de des du elle elles en et eux il ils je
    la le les leur leurs lui ma mais me mes moi mon ne nos notre nous on ou par
    pas pour qu que quel quelle qui sa se ses son sont sur ta te tes toi ton tu
    un une vos votre vous y
    """.split()
)

# Contribution relative de chaque signal au score final (la somme vaut 1).
_WEIGHTS = {
    "similarity": 0.55,
    "course": 0.15,
    "type": 0.12,
    "popularity": 0.10,
    "recency": 0.08,
}

# Au-delà de cet horizon, une session n'est plus considérée comme imminente.
_RECENCY_HORIZON_DAYS = 60

# Nombre d'éléments d'historique pris en compte par source.
_HISTORY_LIMIT = 20


@dataclass(frozen=True)
class Recommendation:
    session: LiveSession
    score: int
    reason: str


@dataclass
class _Profile:
    tokens: Counter = field(default_factory=Counter)
    type_counts: Counter = field(default_factory=Counter)
    course_ids: set[int] = field(default_factory=set)
    enrolled_session_ids: set[int] = field(default_factory=set)


def _tokenize(text):
    normalized = unicodedata.normalize("NFKD", (text or "").lower())
    ascii_text = "".join(char for char in normalized if not unicodedata.combining(char))
    return [
        token
        for token in _TOKEN_PATTERN.findall(ascii_text)
        if len(token) > 2 and token not in _STOPWORDS
    ]


def _session_text(session):
    parts = [session.title, session.description]
    if session.course_id:
        parts.append(session.course.title)
    return " ".join(part for part in parts if part)


def _term_frequencies(text):
    return Counter(_tokenize(text))


def _scaled(frequencies, factor):
    return Counter({term: count * factor for term, count in frequencies.items()})


def _idf(documents):
    total = len(documents)
    document_frequency = Counter()
    for frequencies in documents:
        document_frequency.update(frequencies.keys())
    return {
        term: math.log((1 + total) / (1 + count)) + 1.0
        for term, count in document_frequency.items()
    }


def _weighted_vector(frequencies, idf):
    vector = {term: weight * idf.get(term, 1.0) for term, weight in frequencies.items()}
    norm = math.sqrt(sum(value * value for value in vector.values()))
    if not norm:
        return {}
    return {term: value / norm for term, value in vector.items()}


def _cosine(left, right):
    if not left or not right:
        return 0.0
    if len(left) > len(right):
        left, right = right, left
    return sum(value * right.get(term, 0.0) for term, value in left.items())


def _build_profile(student):
    profile = _Profile()

    enrollments = (
        SessionEnrollment.objects.filter(student=student)
        .exclude(status=SessionEnrollment.EnrollmentStatus.REJECTED)
        .select_related("session", "session__course")
        .order_by("-created_at")[:_HISTORY_LIMIT]
    )
    for enrollment in enrollments:
        session = enrollment.session
        profile.enrolled_session_ids.add(session.pk)
        profile.type_counts[session.session_type] += 1
        if session.course_id:
            profile.course_ids.add(session.course_id)
        profile.tokens.update(_scaled(_term_frequencies(_session_text(session)), 2.0))

    attempts = (
        QuizAttempt.objects.filter(
            student=student,
            status=QuizAttempt.Status.SUBMITTED,
        )
        .select_related("quiz", "quiz__course")
        .order_by("-submitted_at")[:_HISTORY_LIMIT]
    )
    for attempt in attempts:
        quiz = attempt.quiz
        if quiz.course_id:
            profile.course_ids.add(quiz.course_id)
        text = f"{quiz.title} {quiz.course.title}"
        profile.tokens.update(_term_frequencies(text))

    requests = (
        AnnouncementEnrollment.objects.filter(student=student)
        .exclude(status=AnnouncementEnrollment.Status.REJECTED)
        .select_related(
            "announcement",
            "announcement__related_session",
            "announcement__related_session__course",
        )
        .order_by("-created_at")[:_HISTORY_LIMIT]
    )
    for request in requests:
        text = request.announcement.title
        related = request.announcement.related_session
        if related is not None:
            text = f"{text} {_session_text(related)}"
        profile.tokens.update(_scaled(_term_frequencies(text), 1.5))

    return profile


def _confirmed_enrollments(session):
    return sum(
        1
        for enrollment in session.enrollments.all()
        if enrollment.status == SessionEnrollment.EnrollmentStatus.CONFIRMED
    )


def _reason(session, *, similarity, course_match, type_affinity, enrollment_count):
    if course_match:
        return f"Dans la continuité de votre cours « {session.course.title} »"
    if similarity >= 0.15:
        return "Correspond à votre historique de formations"
    if type_affinity >= 0.75:
        return "Même type de session que celles que vous suivez"
    if enrollment_count >= 2:
        return f"Populaire : {enrollment_count} étudiants inscrits"
    return "Prochaine session à venir"


def recommend_sessions_for(student, *, limit=6, now=None):
    """Retourne les ``limit`` sessions à venir les plus pertinentes pour un étudiant."""
    now = now or timezone.now()
    profile = _build_profile(student)

    candidates = [
        session
        for session in LiveSession.objects.select_related("course", "created_by")
        .prefetch_related("assigned_teachers", "enrollments")
        .filter(starts_at__gt=now)
        .exclude(status=LiveSession.Status.CANCELLED)
        if session.pk not in profile.enrolled_session_ids
    ]
    if not candidates:
        return []

    documents = [_term_frequencies(_session_text(session)) for session in candidates]
    idf = _idf(documents)
    profile_vector = _weighted_vector(profile.tokens, idf)
    enrollment_counts = [_confirmed_enrollments(session) for session in candidates]
    max_count = max(enrollment_counts) or 1
    total_type_counts = sum(profile.type_counts.values())

    recommendations = []
    for session, frequencies, enrollment_count in zip(
        candidates, documents, enrollment_counts
    ):
        similarity = _cosine(profile_vector, _weighted_vector(frequencies, idf))
        course_match = 1.0 if session.course_id in profile.course_ids else 0.0
        type_affinity = (
            profile.type_counts[session.session_type] / total_type_counts
            if total_type_counts
            else 0.0
        )
        popularity = enrollment_count / max_count
        days_until = max(0.0, (session.starts_at - now).total_seconds() / 86400)
        recency = max(0.0, 1.0 - days_until / _RECENCY_HORIZON_DAYS)

        score = (
            _WEIGHTS["similarity"] * similarity
            + _WEIGHTS["course"] * course_match
            + _WEIGHTS["type"] * type_affinity
            + _WEIGHTS["popularity"] * popularity
            + _WEIGHTS["recency"] * recency
        )
        recommendations.append(
            Recommendation(
                session=session,
                score=round(min(score, 1.0) * 100),
                reason=_reason(
                    session,
                    similarity=similarity,
                    course_match=course_match,
                    type_affinity=type_affinity,
                    enrollment_count=enrollment_count,
                ),
            )
        )

    recommendations.sort(
        key=lambda item: (-item.score, item.session.starts_at, item.session.pk)
    )
    return recommendations[:limit]
