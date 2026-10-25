"""Catégorisation locale des annonces, sans service externe.

Chaque catégorie possède un petit lexique français pondéré. Le titre compte
double, car il porte l'intention principale de l'annonce. La catégorie est
calculée à la lecture : le texte peut être modifié et aucune migration n'est
nécessaire.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# (clé, libellé, lexique). L'ordre sert d'arbitrage en cas d'égalité.
_CATEGORIES = (
    (
        "formation",
        "Formation",
        {
            "formation": 3,
            "atelier": 3,
            "masterclass": 3,
            "certification": 3,
            "bootcamp": 3,
            "cours": 2,
            "programme": 2,
            "webinaire": 2,
            "seminaire": 2,
            "stage": 2,
            "parcours": 2,
        },
    ),
    (
        "evaluation",
        "Évaluation",
        {
            "examen": 3,
            "evaluation": 3,
            "partiel": 3,
            "rattrapage": 3,
            "quiz": 3,
            "controle": 2,
            "devoir": 2,
            "test": 2,
            "note": 2,
            "notes": 2,
            "resultat": 2,
            "resultats": 2,
            "correction": 2,
        },
    ),
    (
        "administratif",
        "Administratif",
        {
            "paiement": 3,
            "scolarite": 3,
            "attestation": 3,
            "bourse": 3,
            "administratif": 3,
            "administrative": 3,
            "inscription": 2,
            "inscriptions": 2,
            "frais": 2,
            "document": 2,
            "documents": 2,
            "dossier": 2,
            "releve": 2,
            "certificat": 2,
        },
    ),
    (
        "evenement",
        "Événement",
        {
            "conference": 3,
            "evenement": 3,
            "hackathon": 3,
            "ceremonie": 3,
            "portes ouvertes": 3,
            "meetup": 2,
            "competition": 2,
            "tournoi": 2,
            "sortie": 2,
            "journee": 2,
            "club": 2,
            "rencontre": 2,
        },
    ),
    (
        "rappel",
        "Rappel",
        {
            "rappel": 3,
            "n oubliez pas": 3,
            "ne pas oublier": 3,
            "dernier delai": 3,
            "annule": 4,
            "annulee": 4,
            "annulation": 4,
            "report": 3,
            "reporte": 3,
            "avant le": 2,
            "attention": 2,
            "urgent": 2,
            "important": 2,
            "a noter": 2,
            "pensez a": 2,
            "demain": 2,
            "ce soir": 2,
        },
    ),
)

CATEGORY_LABELS = {key: label for key, label, _ in _CATEGORIES}
CATEGORY_LABELS["autre"] = "Autre"
CATEGORY_KEYS = frozenset(CATEGORY_LABELS)
CATEGORY_CHOICES = tuple(CATEGORY_LABELS.items())

_TITLE_FACTOR = 2
_MAX_CONFIDENCE = 99


@dataclass(frozen=True)
class Category:
    key: str
    label: str
    confidence: int
    matched_keywords: tuple[str, ...]


def _normalize(text):
    decomposed = unicodedata.normalize("NFKD", (text or "").lower())
    ascii_text = "".join(char for char in decomposed if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", ascii_text)


def categorize(announcement):
    """Retourne la catégorie la plus probable et les mots-clés qui l'ont motivée."""
    manual = getattr(announcement, "category_override", "")
    if manual in CATEGORY_LABELS:
        return Category(manual, CATEGORY_LABELS[manual], 100, ())

    title = _normalize(getattr(announcement, "title", ""))
    content = _normalize(getattr(announcement, "content", ""))

    scores = {}
    matches = {}
    total = 0
    for key, _label, lexicon in _CATEGORIES:
        score = 0
        found = []
        for keyword, weight in lexicon.items():
            occurrences = title.count(keyword) * _TITLE_FACTOR + content.count(keyword)
            if occurrences:
                score += weight * occurrences
                found.append((keyword, weight, occurrences))
        if score:
            scores[key] = score
            total += score
            matches[key] = tuple(
                keyword
                for keyword, _weight, _count in sorted(
                    found, key=lambda item: (-item[1], -item[2], item[0])
                )
            )

    if not scores:
        return Category("autre", CATEGORY_LABELS["autre"], 0, ())

    key = max(scores, key=lambda candidate: (scores[candidate], -_order(candidate)))
    confidence = min(_MAX_CONFIDENCE, round(scores[key] / total * 100))
    return Category(key, CATEGORY_LABELS[key], confidence, matches[key][:4])


def _order(key):
    for index, (candidate, _label, _lexicon) in enumerate(_CATEGORIES):
        if candidate == key:
            return index
    return len(_CATEGORIES)
