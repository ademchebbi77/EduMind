"""Prévision locale du remplissage d'une session.

Aucun modèle entraîné : la prévision s'appuie sur l'historique des sessions
passées comparables (même cours, même type). On calcule une moyenne pondérée
par la récence des inscriptions confirmées, puis on applique un facteur de
maturité lié au temps restant avant le début. Les résultats sont volontairement
prudents et exposent leur niveau de confiance.
"""

from __future__ import annotations

from dataclasses import dataclass

from django.utils import timezone

from .models import LiveSession, SessionEnrollment

# Demi-vie de la pondération par récence, en jours.
_RECENCY_HALF_LIFE = 90.0
# Lissage bayésien pour éviter qu'une session isolée ne domine.
_PRIOR_COUNT = 2.0
_PRIOR_WEIGHT = 1.5
# Durée de vie typique d'une session quand l'historique est vide.
_DEFAULT_LEAD_DAYS = 14.0

_LEVELS = (
    (4, "high", "Élevée"),
    (2, "medium", "Moyenne"),
    (0, "low", "Faible"),
)

_SPREAD = {"high": 0.10, "medium": 0.25, "low": 0.40}


@dataclass(frozen=True)
class _HistoryRow:
    count: int
    age_days: float
    lead_days: float
    session_type: str
    course_id: int | None


@dataclass(frozen=True)
class Forecast:
    expected_enrollments: int
    current_enrollments: int
    minimum: int
    maximum: int
    baseline: float
    sample_size: int
    confidence: str
    confidence_label: str
    reasons: tuple[str, ...]


def _confirmed_count(session):
    return sum(
        1
        for enrollment in session.enrollments.all()
        if enrollment.status == SessionEnrollment.EnrollmentStatus.CONFIRMED
    )


def build_history(now=None):
    """Historique des sessions passées, une seule requête + préchargement."""
    now = now or timezone.now()
    sessions = (
        LiveSession.objects.filter(starts_at__lt=now)
        .exclude(status=LiveSession.Status.CANCELLED)
        .prefetch_related("enrollments")
    )
    rows = []
    for session in sessions:
        lead_days = max(
            0.5, (session.starts_at - session.created_at).total_seconds() / 86400
        )
        rows.append(
            _HistoryRow(
                count=_confirmed_count(session),
                age_days=max(0.0, (now - session.starts_at).total_seconds() / 86400),
                lead_days=lead_days,
                session_type=session.session_type,
                course_id=session.course_id,
            )
        )
    return rows


def _similarity(session, row):
    score = 0.0
    if row.session_type == session.session_type:
        score += 2.0
    if session.course_id and row.course_id == session.course_id:
        score += 3.0
    return score


def _weight(row, similarity):
    recency = 0.5 ** (row.age_days / _RECENCY_HALF_LIFE)
    return similarity * recency


def _confidence(sample_size):
    for threshold, key, label in _LEVELS:
        if sample_size >= threshold:
            return key, label
    return "low", "Faible"


def forecast_session(session, *, history=None, now=None):
    """Prévoit le nombre d'inscrits confirmés à l'ouverture de la session."""
    now = now or timezone.now()
    history = build_history(now) if history is None else history

    similar = []
    weights = []
    for row in history:
        similarity = _similarity(session, row)
        if similarity:
            similar.append(row)
            weights.append(_weight(row, similarity))

    if not similar:
        # Repli : toutes les sessions passées, sans distinction de type.
        similar = history
        weights = [_weight(row, 1.0) for row in history]

    current = _confirmed_count(session)
    days_until = max(0.0, (session.starts_at - now).total_seconds() / 86400)

    if not similar:
        return Forecast(
            expected_enrollments=current,
            current_enrollments=current,
            minimum=current,
            maximum=current,
            baseline=0.0,
            sample_size=0,
            confidence="low",
            confidence_label="Faible",
            reasons=(
                "Pas encore d'historique de sessions : prévision limitée aux inscrits actuels",
            ),
        )

    total_weight = sum(weights)
    weighted_counts = sum(row.count * weight for row, weight in zip(similar, weights))
    baseline = (
        weighted_counts + _PRIOR_COUNT * _PRIOR_WEIGHT
    ) / (total_weight + _PRIOR_WEIGHT)
    lead_days = sum(
        row.lead_days * weight for row, weight in zip(similar, weights)
    ) / total_weight

    maturity = 1.0 - min(days_until, lead_days) / lead_days
    expected = max(current, round(baseline * maturity))

    confidence, confidence_label = _confidence(len(similar))
    spread = _SPREAD[confidence]
    minimum = max(current, round(expected * (1 - spread)))
    maximum = max(current, round(expected * (1 + spread)))

    reasons = [
        f"Basé sur {len(similar)} session(s) passée(s) comparable(s)",
        f"Moyenne historique : {baseline:.1f} inscrit(s)",
        f"{current} inscrit(s) confirmé(s) à ce jour",
    ]
    if days_until > 0:
        reasons.append(f"{days_until:.0f} jour(s) avant le début")
    else:
        reasons.append("La session a déjà commencé")

    return Forecast(
        expected_enrollments=expected,
        current_enrollments=current,
        minimum=minimum,
        maximum=maximum,
        baseline=round(baseline, 2),
        sample_size=len(similar),
        confidence=confidence,
        confidence_label=confidence_label,
        reasons=tuple(reasons),
    )


def forecast_upcoming(sessions, *, now=None, limit=5):
    """Retourne [(session, prévision)] pour les prochaines sessions."""
    now = now or timezone.now()
    history = build_history(now)
    upcoming = [
        session
        for session in sessions
        if session.starts_at > now and session.status != LiveSession.Status.CANCELLED
    ]
    upcoming.sort(key=lambda session: (session.starts_at, session.pk))
    return [
        (session, forecast_session(session, history=history, now=now))
        for session in upcoming[:limit]
    ]
