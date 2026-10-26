"""Extraction locale des champs d'une annonce à partir d'un texte descriptif en français.

Tout est déterministe et calculé sur le serveur : expressions régulières, petits
lexiques, la catégorisation existante (``categorization.py``) et une similarité
TF-IDF locale pour retrouver la session liée. Aucun service externe, aucun appel
réseau, aucune écriture en base.

Chaque champ est renvoyé avec sa valeur (ou ``None``), une confiance de 0 à 100 et
l'extrait du texte qui l'a motivé, pour que l'utilisateur puisse vérifier avant
d'appliquer.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, timedelta
from types import SimpleNamespace

from django.core.exceptions import ValidationError
from django.core.validators import URLValidator
from django.utils import timezone

from assessments.generation.stopwords import FRENCH as FRENCH_STOPWORDS

from .categorization import _normalize, categorize
from .models import Announcement

MAX_TEXT_LENGTH = 5000
TITLE_MAX_LENGTH = 200
SESSION_MIN_SCORE = 0.15

MONTHS = {
    "janvier": 1, "janv": 1, "fevrier": 2, "fevr": 2, "fev": 2, "mars": 3, "avril": 4,
    "avr": 4, "mai": 5, "juin": 6, "juillet": 7, "juil": 7, "aout": 8, "septembre": 9,
    "sept": 9, "octobre": 10, "oct": 10, "novembre": 11, "nov": 11, "decembre": 12, "dec": 12,
}
WEEKDAYS = {
    "lundi": 0, "mardi": 1, "mercredi": 2, "jeudi": 3, "vendredi": 4, "samedi": 5, "dimanche": 6,
}
NUMBER_WORDS = {
    "un": 1, "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5, "six": 6, "sept": 7,
    "huit": 8, "neuf": 9, "dix": 10, "onze": 11, "douze": 12, "treize": 13, "quatorze": 14,
    "quinze": 15, "seize": 16, "vingt": 20, "trente": 30, "quarante": 40, "cinquante": 50,
    "soixante": 60, "cent": 100,
}
MEETING_DOMAINS = ("meet.google.com", "zoom.us", "teams.microsoft.com", "teams.live.com", "webex.com", "meet.jit.si")

_MONTH = "|".join(sorted(MONTHS, key=len, reverse=True))
_WEEKDAY = "|".join(WEEKDAYS)
_NUMBER = r"(\d{1,5}|" + "|".join(sorted(NUMBER_WORDS, key=len, reverse=True)) + r")"

# --- Expressions régulières (appliquées au texte « replié » : minuscules, sans accents) ---

_LABELLED_TITLE = re.compile(r"^[ \t]*(?:titre|objet|sujet)[ \t]*:[ \t]*(\S.*)$", re.MULTILINE)

_STUDENTS = r"(?:etudiant(?:e)?s?|eleves?|apprenant(?:e)?s?|stagiaires?)"
_TEACHERS = r"(?:enseignant(?:e)?s?|professeurs?|profs?|formateurs?|formatrices?|corps enseignant)"
_DIRECTED = (
    r"(?:reserve(?:e)?s?|destine(?:e)?s?|adresse(?:e)?s?|s'adresse|ouvert(?:e)?s?|"
    r"a l'attention|a l'intention|invite(?:e)?s?|concerne|pour)"
    r"\s+(?:a\s+|aux\s+|des\s+|les\s+|tous les\s+|toutes les\s+|l'ensemble des\s+)?"
)
_AUDIENCE_ALL = re.compile(
    r"\b(?:ouvert(?:e)?s? a tous|tout le monde|tous les (?:utilisateurs|membres)|"
    r"toute la communaute|a tous et a toutes)\b"
)
_TO_STUDENTS = re.compile(_DIRECTED + _STUDENTS + r"\b")
_TO_TEACHERS = re.compile(_DIRECTED + _TEACHERS + r"\b")
_MENTIONS_STUDENTS = re.compile(r"\b" + _STUDENTS + r"\b")
_MENTIONS_TEACHERS = re.compile(r"\b" + _TEACHERS + r"\b")

_ISO_DATE = re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b")
# « 12/03 », « 12/03/2026 », « 12.03.2026 » (le point exige l'année : « Python 3.12 »
# n'est pas une date).
_NUMERIC_DATE = re.compile(r"\b(\d{1,2})([/.])(\d{1,2})(?:\2(\d{4}|\d{2}))?\b")
_TEXT_DATE = re.compile(
    r"\b(?:(" + _WEEKDAY + r")\s+)?(1er|\d{1,2})\s+(" + _MONTH + r")\.?(?:\s+(\d{4}))?\b"
)
_RELATIVE_DATE = re.compile(r"\b(apres-demain|apres demain|aujourd'hui|demain)\b")
_WEEKDAY_ONLY = re.compile(r"\b(?:ce |cette )?(" + _WEEKDAY + r")(\s+prochain)?\b")
# Appliquée aux quelques mots qui précèdent une date, espaces déjà normalisés.
_DEADLINE_BEFORE = re.compile(
    r"(?:avant|jusqu'au|jusqu'a|date limite|au plus tard|delai|d'ici)(?: le| au| ?:)?$"
)

_TIME_H = re.compile(r"\b(\d{1,2})\s*(?:h|heures?)\s*(\d{2})?\b")
_TIME_COLON = re.compile(r"\b(\d{1,2}):(\d{2})\b")
_NOON = re.compile(r"\ba midi\b")
_TIME_PREPOSITION = re.compile(r"(?:\ba|\bde|\bdes|\bvers|\bentre|\bdebut)\s*$")
_DURATION_BEFORE = re.compile(r"(?:pendant|durant|duree(?: de)?|dure|durera|en)\s*$")

_URL = re.compile(r"https?://[^\s<>\"'()\[\]]+", re.IGNORECASE)
_WWW = re.compile(r"(?<![/\w.])www\.[^\s<>\"'()\[\]]+", re.IGNORECASE)

_CAPACITY_PATTERNS = (
    (re.compile(r"\blimite(?:e)?s?\s+a\s+" + _NUMBER + r"\b"), 90),
    (re.compile(r"\b" + _NUMBER + r"\s+places?\b"), 90),
    (re.compile(r"\b(?:capacite|nombre de places|places disponibles|effectif)(?:\s+max(?:imum|imale)?)?\s*(?:de|:)?\s*" + _NUMBER + r"\b"), 90),
    (re.compile(r"\b(?:maximum|max\.?|au plus|jusqu'a)\s*(?:de\s+)?" + _NUMBER + r"\s+(?:participants?|personnes?|inscrits?|etudiants?)\b"), 85),
    (re.compile(r"\b" + _NUMBER + r"\s+(?:participants?|personnes?|inscrits?)\s+(?:au\s+)?max(?:imum)?\b"), 85),
)
_UNLIMITED = re.compile(r"\b(?:places? illimitees?|sans limite de places|nombre de places illimite|inscriptions illimitees)\b")


@dataclass
class Extracted:
    value: object = None
    confidence: int = 0
    source: str = ""
    label: str = ""
    extra: dict | None = None

    def as_dict(self):
        data = {
            "value": self.value,
            "label": self.label or (str(self.value) if self.value is not None else ""),
            "confidence": max(0, min(100, int(self.confidence))),
            "detected": self.confidence > 0,
            "source": self.source or "Non détecté",
        }
        if self.extra:
            data.update(self.extra)
        return data


def fold(text):
    """Minuscules sans accents, en gardant la même longueur que le texte d'origine.

    Les positions des correspondances restent donc valables dans le texte original,
    ce qui permet d'en citer l'extrait exact.
    """
    folded = []
    for char in text:
        base = "".join(c for c in unicodedata.normalize("NFKD", char) if not unicodedata.combining(c))
        folded.append(base.lower()[:1] if base else char)
    return "".join(folded).replace("’", "'")


def _quote(text, start, end):
    return f"« {text[start:end].strip()} »"


# --- Titre et contenu -------------------------------------------------------------


def _strip_decorations(line):
    """Retire puces, emojis et « : » final d'une ligne de titre."""
    return re.sub(r"^[^\w«\"(]+", "", line).rstrip(" \t:").strip()


def extract_title_and_content(text, folded):
    labelled = _LABELLED_TITLE.search(folded)
    if labelled:
        title = _strip_decorations(text[labelled.start(1):labelled.end(1)])
        content = (text[: labelled.start()] + text[labelled.end():]).strip()
        return (
            Extracted(title[:TITLE_MAX_LENGTH], 95, "Ligne « Titre : » / « Objet : »"),
            _content(content or text, 90 if content else 60),
        )

    lines = [line for line in text.split("\n") if line.strip()]
    first = _strip_decorations(lines[0]) if lines else ""
    if len(lines) > 1 and 3 <= len(first) <= 120 and not first.endswith("."):
        body = text.split(lines[0], 1)[1].strip()
        return Extracted(first, 85, "Première ligne du texte"), _content(body, 90)

    sentence = re.split(r"(?<=[.!?])\s+", text.strip(), maxsplit=1)[0].rstrip(".!? ")
    if len(sentence) > 100:
        sentence = sentence[:100].rsplit(" ", 1)[0] + "…"
    return Extracted(_strip_decorations(sentence), 55, "Première phrase du texte"), _content(text, 80)


def _content(text, confidence):
    cleaned = re.sub(r"\n{3,}", "\n\n", text.strip())
    if not cleaned:
        return Extracted()
    return Extracted(cleaned, confidence, "Texte complet, sans la ligne de titre")


# --- Audience ----------------------------------------------------------------------


def extract_audience(text, folded):
    def result(value, confidence, match):
        label = Announcement.TargetAudience(value).label
        return Extracted(value, confidence, _quote(text, *match.span()), label)

    everyone = _AUDIENCE_ALL.search(folded)
    if everyone:
        return result("all", 90, everyone)

    to_students, to_teachers = _TO_STUDENTS.search(folded), _TO_TEACHERS.search(folded)
    if to_students and to_teachers:
        return result("all", 85, to_students)
    if to_students:
        return result("students", 90, to_students)
    if to_teachers:
        return result("teachers", 90, to_teachers)

    students, teachers = _MENTIONS_STUDENTS.search(folded), _MENTIONS_TEACHERS.search(folded)
    if students and teachers:
        return result("all", 60, students)
    if students:
        return result("students", 65, students)
    if teachers:
        return result("teachers", 65, teachers)
    return Extracted()


# --- Catégorie (logique existante) ----------------------------------------------------


def extract_category(title, content):
    category = categorize(SimpleNamespace(title=title, content=content, category_override=""))
    if category.key == "autre":
        return Extracted()
    return Extracted(
        category.key,
        category.confidence,
        "Mots-clés : " + ", ".join(category.matched_keywords),
        category.label,
    )


# --- Date ----------------------------------------------------------------------------


def _with_year(day, month, year, today):
    """Date réelle ou None ; sans année, on prend la prochaine occurrence."""
    try:
        if year:
            year = int(year)
            return date(year + 2000 if year < 100 else year, month, day)
        candidate = date(today.year, month, day)
        return candidate if candidate >= today else date(today.year + 1, month, day)
    except ValueError:
        return None


def _date_candidates(folded, today):
    """(début, fin, date, confiance) pour chaque date trouvée dans le texte."""
    found = []
    taken = []

    for match in _TEXT_DATE.finditer(folded):
        day = 1 if match.group(2) == "1er" else int(match.group(2))
        value = _with_year(day, MONTHS[match.group(3)], match.group(4), today)
        if value:
            found.append((match.start(), match.end(), value, 95 if match.group(4) else 85))
            taken.append(match.span())

    for match in _ISO_DATE.finditer(folded):
        value = _with_year(int(match.group(3)), int(match.group(2)), match.group(1), today)
        if value:
            found.append((match.start(), match.end(), value, 95))
            taken.append(match.span())

    for match in _NUMERIC_DATE.finditer(folded):
        if any(start <= match.start() < end for start, end in taken):
            continue
        if match.group(2) == "." and not match.group(4):
            continue
        value = _with_year(int(match.group(1)), int(match.group(3)), match.group(4), today)
        if value:
            found.append((match.start(), match.end(), value, 90 if match.group(4) else 75))

    for match in _RELATIVE_DATE.finditer(folded):
        offset = {"aujourd'hui": 0, "demain": 1}.get(match.group(1), 2)
        found.append((match.start(), match.end(), today + timedelta(days=offset), 80))

    for match in _WEEKDAY_ONLY.finditer(folded):
        if any(start <= match.start() < end for start, end in taken):
            continue
        days_ahead = (WEEKDAYS[match.group(1)] - today.weekday()) % 7
        if days_ahead == 0 or match.group(2):
            days_ahead = days_ahead or 7
        found.append((match.start(), match.end(), today + timedelta(days=days_ahead), 60))

    return sorted(found)


def extract_date(text, folded, today):
    candidates = _date_candidates(folded, today)
    if not candidates:
        return Extracted()

    # Une date précédée de « avant le », « date limite »… est une échéance, pas l'événement.
    def is_deadline(start):
        before = " ".join(folded[max(0, start - 25):start].split())
        return bool(_DEADLINE_BEFORE.search(before))

    events = [item for item in candidates if not is_deadline(item[0])]
    start, end, value, confidence = (events or candidates)[0]
    source = _quote(text, start, end)
    if not events:
        confidence -= 25
        source += " (date limite)"
    if value < today:
        confidence -= 20
        source += " (date passée)"
    return Extracted(value.isoformat(), confidence, source, value.strftime("%d/%m/%Y"))


# --- Heure ---------------------------------------------------------------------------


def extract_time(text, folded):
    candidates = []
    for pattern, base in ((_TIME_H, 75), (_TIME_COLON, 85)):
        for match in pattern.finditer(folded):
            hour, minute = int(match.group(1)), int(match.group(2) or 0)
            if hour > 23 or minute > 59:
                continue
            before = folded[max(0, match.start() - 12):match.start()]
            if _DURATION_BEFORE.search(before):
                continue  # « pendant 2h » est une durée
            confidence = 90 if _TIME_PREPOSITION.search(before) else base
            candidates.append((match.start(), match.end(), hour, minute, confidence))
    noon = _NOON.search(folded)
    if noon:
        candidates.append((noon.start(), noon.end(), 12, 0, 80))
    if not candidates:
        return Extracted()

    start, end, hour, minute, confidence = sorted(candidates)[0]
    value = f"{hour:02d}:{minute:02d}"
    return Extracted(value, confidence, _quote(text, start, end), value.replace(":", "h"))


# --- Lien ----------------------------------------------------------------------------


def extract_link(text):
    validate = URLValidator(schemes=["http", "https"])
    found = []
    for match in _URL.finditer(text):
        found.append((match.group(0), 0))
    for match in _WWW.finditer(text):
        found.append(("https://" + match.group(0), -15))

    best = None
    for raw, penalty in found:
        url = raw.rstrip(".,;:!?»")
        try:
            validate(url)
        except ValidationError:
            continue
        meeting = any(domain in url.lower() for domain in MEETING_DOMAINS)
        candidate = (95 if meeting else 70) + penalty
        if best is None or candidate > best[1]:
            best = (url, candidate, meeting)
    if not best:
        return Extracted()
    url, confidence, meeting = best
    source = "Lien de visioconférence" if meeting else "Lien trouvé dans le texte"
    return Extracted(url[:200], confidence, source)


# --- Nombre de places ------------------------------------------------------------------


def _number(token):
    return int(token) if token.isdigit() else NUMBER_WORDS.get(token)


def extract_capacity(text, folded):
    unlimited = _UNLIMITED.search(folded)
    if unlimited:
        return Extracted(None, 80, _quote(text, *unlimited.span()), "Illimité")
    for pattern, confidence in _CAPACITY_PATTERNS:
        for match in pattern.finditer(folded):
            value = _number(match.group(1))
            if value and 1 <= value <= 100000:
                return Extracted(value, confidence, _quote(text, *match.span()))
    return Extracted()


# --- Session liée (TF-IDF local) --------------------------------------------------------

# Mêmes règles de normalisation que le texte ; seuls les mots simples sont gardés.
_STOPWORDS = sorted(
    {word for word in (_normalize(item).strip() for item in FRENCH_STOPWORDS) if word and " " not in word}
)


def _session_document(session):
    # Le titre compte double : il résume la session.
    return f"{session.title} {session.title} {session.description or ''}"


def extract_session(text, sessions, event_date=None):
    sessions = list(sessions)
    if not sessions:
        return Extracted()

    # Import local : scikit-learn n'est chargé que lorsqu'on analyse un texte.
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity

    documents = [_session_document(session) for session in sessions]
    vectorizer = TfidfVectorizer(
        preprocessor=_normalize, stop_words=_STOPWORDS, ngram_range=(1, 2), sublinear_tf=True
    )
    try:
        matrix = vectorizer.fit_transform(documents + [text])
    except ValueError:  # aucun mot utile
        return Extracted()
    similarities = cosine_similarity(matrix[-1], matrix[:-1])[0]

    normalized_text = _normalize(text)
    best, best_score = None, 0.0
    for session, similarity in zip(sessions, similarities):
        if similarity <= 0:
            continue
        score = float(similarity)
        if f" {_normalize(session.title).strip()} " in f" {normalized_text} ":
            score += 0.15  # titre cité tel quel
        if event_date and timezone.localdate(session.starts_at).isoformat() == event_date:
            score += 0.15  # même jour que l'événement
        if score > best_score:
            best, best_score = session, score

    if best is None or best_score < SESSION_MIN_SCORE:
        return Extracted()
    return Extracted(
        best.pk,
        min(95, round(best_score * 100)),
        f"Similarité TF-IDF {best_score:.2f} avec « {best.title} »",
        best.title,
        {
            "session_type": best.session_type,
            "starts_at": best.starts_at.isoformat(),
            "meeting_link": best.meeting_link,
        },
    )


# --- Point d'entrée ----------------------------------------------------------------------


def _blank(match):
    return " " * len(match.group(0))


def extract_announcement(text, *, sessions=(), today=None):
    """Retourne ``{champ: {value, label, confidence, detected, source}}``."""
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n").strip()[:MAX_TEXT_LENGTH]
    folded = fold(text)
    # Les liens sont masqués (même longueur) pour que leurs chiffres ne passent pas
    # pour une date, une heure ou un nombre de places.
    masked = _WWW.sub(_blank, _URL.sub(_blank, folded))
    today = today or timezone.localdate()

    title, content = extract_title_and_content(text, folded)
    event_date = extract_date(text, masked, today)
    fields = {
        "title": title,
        "content": content,
        "target_audience": extract_audience(text, masked),
        "category": extract_category(title.value or "", content.value or text),
        "event_date": event_date,
        "event_time": extract_time(text, masked),
        "meeting_link": extract_link(text),
        "capacity": extract_capacity(text, masked),
        "related_session": extract_session(text, sessions, event_date.value),
    }
    return {name: field.as_dict() for name, field in fields.items()}
