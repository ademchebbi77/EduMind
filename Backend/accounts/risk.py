"""Détection locale des étudiants à risque, par règles et seuils.

Le score (0-100) agrège quatre signaux observables dans la base : résultats aux
quiz, échecs répétés, inactivité et exercices en retard. Aucun modèle n'est
entraîné et aucun service externe n'est appelé ; les justifications sont
renvoyées avec le score pour rester explicables.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from django.db.models import Avg, Count, Max, Q
from django.utils import timezone

from assessments.models import Exercise, ExerciseSubmission, Quiz, QuizAttempt
from sessions.models import SessionEnrollment

from .models import User

_QUIZ_WINDOW_DAYS = 90
_LEVELS = ((55, "high", "Élevé"), (30, "medium", "Moyen"), (0, "low", "Faible"))


@dataclass(frozen=True)
class RiskProfile:
    student: User
    score: int
    level: str
    label: str
    reasons: tuple[str, ...]
    quiz_average: float | None
    quiz_attempts: int
    failed_attempts: int
    days_inactive: int | None
    overdue_exercises: int


def _last_activity_by_student(student_ids):
    last_activity = {}

    def merge(queryset, field):
        rows = (
            queryset.filter(student_id__in=student_ids)
            .values("student_id")
            .annotate(last=Max(field))
        )
        for row in rows:
            if row["last"] is None:
                continue
            current = last_activity.get(row["student_id"])
            if current is None or row["last"] > current:
                last_activity[row["student_id"]] = row["last"]

    merge(QuizAttempt.objects.all(), "submitted_at")
    merge(ExerciseSubmission.objects.all(), "submitted_at")
    merge(SessionEnrollment.objects.all(), "created_at")
    return last_activity


def _level_for(score):
    for threshold, level, label in _LEVELS:
        if score >= threshold:
            return level, label
    return "low", "Faible"


def compute_risk_profiles(students, *, now=None):
    """Calcule un profil de risque pour chaque étudiant fourni."""
    now = now or timezone.now()
    students = list(students)
    if not students:
        return []

    student_ids = [student.pk for student in students]
    cutoff = now - timedelta(days=_QUIZ_WINDOW_DAYS)

    attempt_rows = (
        QuizAttempt.objects.filter(
            student_id__in=student_ids,
            status=QuizAttempt.Status.SUBMITTED,
            submitted_at__gte=cutoff,
        )
        .values("student_id")
        .annotate(
            average=Avg("percentage"),
            attempts=Count("id"),
            failed=Count("id", filter=Q(passed=False)),
        )
    )
    attempt_stats = {row["student_id"]: row for row in attempt_rows}

    last_activity = _last_activity_by_student(student_ids)

    overdue_total = Exercise.objects.filter(
        is_published=True, due_at__lt=now
    ).count()
    done_rows = (
        ExerciseSubmission.objects.filter(
            student_id__in=student_ids,
            exercise__is_published=True,
            exercise__due_at__lt=now,
        )
        .values("student_id")
        .annotate(done=Count("exercise", distinct=True))
    )
    done_exercises = {row["student_id"]: row["done"] for row in done_rows}
    quizzes_exist = Quiz.objects.filter(is_published=True).exists()

    profiles = []
    for student in students:
        stats = attempt_stats.get(student.pk, {})
        quiz_average = (
            round(float(stats["average"]), 1) if stats.get("average") is not None else None
        )
        quiz_attempts = stats.get("attempts", 0)
        failed_attempts = stats.get("failed", 0)

        last_seen = last_activity.get(student.pk) or student.last_login
        days_inactive = (
            max(0, (now - last_seen).days) if last_seen is not None else None
        )

        done = done_exercises.get(student.pk, 0)
        overdue_exercises = max(0, overdue_total - done)

        score = 0
        reasons = []

        if quiz_average is not None and quiz_average < 50:
            score += 35
            reasons.append(f"Moyenne aux quiz faible ({quiz_average:.0f} %)")
        elif quiz_average is not None and quiz_average < 65:
            score += 18
            reasons.append(f"Moyenne aux quiz fragile ({quiz_average:.0f} %)")

        if failed_attempts >= 2:
            score += min(12, 4 * failed_attempts)
            reasons.append(f"{failed_attempts} échec(s) aux quiz")

        if quiz_attempts == 0 and quizzes_exist:
            score += 8
            reasons.append("Aucune tentative de quiz enregistrée")

        if days_inactive is None:
            score += 10
            reasons.append("Aucune activité enregistrée")
        elif days_inactive > 30:
            score += 25
            reasons.append(f"Aucune activité depuis {days_inactive} jours")
        elif days_inactive > 14:
            score += 12
            reasons.append(f"Inactif depuis {days_inactive} jours")

        if overdue_exercises:
            score += min(20, 10 * overdue_exercises)
            reasons.append(f"{overdue_exercises} exercice(s) en retard")

        score = max(0, min(100, score))
        level, label = _level_for(score)
        profiles.append(
            RiskProfile(
                student=student,
                score=score,
                level=level,
                label=label,
                reasons=tuple(reasons),
                quiz_average=quiz_average,
                quiz_attempts=quiz_attempts,
                failed_attempts=failed_attempts,
                days_inactive=days_inactive,
                overdue_exercises=overdue_exercises,
            )
        )

    profiles.sort(
        key=lambda profile: (
            -profile.score,
            -(profile.days_inactive or 0),
            profile.student.full_name,
        )
    )
    return profiles
