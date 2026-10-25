"""Meilleurs créneaux de planification, calculés sur l'historique local.

On regroupe les sessions passées par jour de la semaine et heure de début,
puis on moyenne les inscriptions confirmées en pondérant les sessions récentes.
Le score combine le remplissage moyen et la taille de l'échantillon, afin de
ne pas recommander un créneau fondé sur une seule session.
"""

from __future__ import annotations

from dataclasses import dataclass

from django.utils import timezone

from .models import LiveSession, SessionEnrollment

_WEEKDAYS = (
    "Lundi",
    "Mardi",
    "Mercredi",
    "Jeudi",
    "Vendredi",
    "Samedi",
    "Dimanche",
)

_RECENCY_HALF_LIFE = 120.0
_SAMPLE_FULL = 5

_LEVELS = ((4, "high", "Élevée"), (2, "medium", "Moyenne"), (0, "low", "Faible"))


@dataclass(frozen=True)
class TimeSlot:
    weekday: int
    weekday_label: str
    hour: int
    average_enrollments: float
    session_count: int
    score: int
    confidence: str
    confidence_label: str


def _confirmed_count(session):
    return sum(
        1
        for enrollment in session.enrollments.all()
        if enrollment.status == SessionEnrollment.EnrollmentStatus.CONFIRMED
    )


def _confidence(session_count):
    for threshold, key, label in _LEVELS:
        if session_count >= threshold:
            return key, label
    return "low", "Faible"


def past_sessions(now=None):
    now = now or timezone.now()
    return (
        LiveSession.objects.filter(starts_at__lt=now)
        .exclude(status=LiveSession.Status.CANCELLED)
        .prefetch_related("enrollments")
    )


def best_time_slots(*, sessions=None, now=None, limit=3):
    """Retourne les meilleurs créneaux (jour, heure) d'après le passé."""
    now = now or timezone.now()
    if sessions is None:
        sessions = past_sessions(now)

    buckets = {}
    for session in sessions:
        local_start = timezone.localtime(session.starts_at)
        key = (local_start.weekday(), local_start.hour)
        count = _confirmed_count(session)
        age_days = max(0.0, (now - session.starts_at).total_seconds() / 86400)
        weight = 0.5 ** (age_days / _RECENCY_HALF_LIFE)
        bucket = buckets.setdefault(key, {"weight": 0.0, "counts": 0.0, "sessions": 0})
        bucket["weight"] += weight
        bucket["counts"] += count * weight
        bucket["sessions"] += 1

    if not buckets:
        return []

    raw = []
    for (weekday, hour), bucket in buckets.items():
        average = bucket["counts"] / bucket["weight"] if bucket["weight"] else 0.0
        raw.append((weekday, hour, average, bucket["sessions"]))

    best_average = max(item[2] for item in raw) or 1.0
    slots = []
    for weekday, hour, average, session_count in raw:
        fill_part = average / best_average
        sample_part = min(session_count, _SAMPLE_FULL) / _SAMPLE_FULL
        score = round((0.7 * fill_part + 0.3 * sample_part) * 100)
        confidence, confidence_label = _confidence(session_count)
        slots.append(
            TimeSlot(
                weekday=weekday,
                weekday_label=_WEEKDAYS[weekday],
                hour=hour,
                average_enrollments=round(average, 1),
                session_count=session_count,
                score=score,
                confidence=confidence,
                confidence_label=confidence_label,
            )
        )

    slots.sort(key=lambda slot: (-slot.score, -slot.average_enrollments, slot.weekday, slot.hour))
    return slots[:limit]
