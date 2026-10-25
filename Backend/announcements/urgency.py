"""Score d'urgence d'une annonce, calculé localement à la lecture.

Le score combine quatre signaux : épinglage, proximité de la date d'événement,
vocabulaire d'urgence dans le texte et engagement (inscriptions confirmées).
Il est dérivé au moment de la lecture plutôt que stocké, car la proximité
temporelle change chaque jour : un champ en base deviendrait obsolète sans
tâche planifiée.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import timedelta

from django.utils import timezone

# Poids des expressions d'urgence, comparées sur du texte normalisé.
_KEYWORDS = {
    "urgent": 12,
    "urgence": 12,
    "annule": 10,
    "dernier delai": 10,
    "date limite": 10,
    "ce soir": 10,
    "important": 8,
    "obligatoire": 8,
    "places limitees": 8,
    "report": 8,
    "demain": 8,
    "rappel": 6,
    "attention": 4,
    "inscription": 4,
}

_KEYWORD_CAP = 25
_ENGAGEMENT_CAP = 15
_PINNED_POINTS = 25
_FRESH_POINTS = 10
_FRESH_DAYS = 3

# (seuil, niveau technique, libellé français), du plus élevé au plus bas.
_LEVELS = (
    (60, "high", "Élevée"),
    (30, "medium", "Moyenne"),
    (0, "low", "Faible"),
)


@dataclass(frozen=True)
class Urgency:
    score: int
    level: str
    label: str
    reasons: tuple[str, ...]


def _normalize(text):
    decomposed = unicodedata.normalize("NFKD", (text or "").lower())
    ascii_text = "".join(char for char in decomposed if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", ascii_text)


def compute_urgency(announcement, *, enrollment_count=None, today=None):
    """Retourne le score d'urgence (0-100) et ses justifications."""
    today = today or timezone.localdate()
    if enrollment_count is None:
        enrollment_count = (
            announcement.enrollments.filter(status="confirmed").count()
            if announcement.pk
            else 0
        )

    score = 0
    reasons = []

    if announcement.is_pinned:
        score += _PINNED_POINTS
        reasons.append("Épinglée par l'équipe pédagogique")

    if announcement.event_date:
        days_until = (announcement.event_date - today).days
        if days_until < 0:
            pass
        elif days_until <= 2:
            score += 35
            reasons.append("Événement imminent")
        elif days_until <= 7:
            score += 22
            reasons.append("Événement cette semaine")
        elif days_until <= 30:
            score += 10
            reasons.append("Événement ce mois-ci")

    text = _normalize(f"{announcement.title} {announcement.content}")
    matched = [keyword for keyword in _KEYWORDS if keyword in text]
    if matched:
        score += min(_KEYWORD_CAP, sum(_KEYWORDS[keyword] for keyword in matched))
        reasons.append("Expressions repérées : " + ", ".join(matched[:3]))

    if enrollment_count:
        score += min(_ENGAGEMENT_CAP, 3 * enrollment_count)
        reasons.append(f"{enrollment_count} inscription(s) confirmée(s)")

    if (
        announcement.created_at
        and timezone.now() - announcement.created_at < timedelta(days=_FRESH_DAYS)
    ):
        score += _FRESH_POINTS
        reasons.append("Annonce récente")

    score = max(0, min(100, score))
    for threshold, level, label in _LEVELS:
        if score >= threshold:
            return Urgency(score=score, level=level, label=label, reasons=tuple(reasons))
