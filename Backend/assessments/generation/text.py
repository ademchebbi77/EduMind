"""Language detection, sentence splitting and tokenisation (pure Python)."""

import re
import unicodedata

from . import stopwords

WORD = r"[0-9A-Za-zÀ-ÖØ-öø-ÿŒœ]+(?:[-.][0-9A-Za-zÀ-ÖØ-öø-ÿŒœ]+)*"
WORD_RE = re.compile(WORD)

# Abbreviations whose trailing period must not end a sentence.
ABBREVIATIONS = {
    "e.g", "i.e", "etc", "vs", "dr", "mr", "mrs", "ms", "prof", "fig", "no", "p", "pp",
    "cf", "env", "ex", "mme", "mlle", "m", "chap", "vol", "approx", "art",
}

_SENTENCE_END_RE = re.compile(r"([.!?;…])(\s+)(?=[«\"“(A-ZÀ-ÖØ-Þ0-9])")
_URL_RE = re.compile(r"https?://|www\.|\S+@\S+")


def strip_accents(value):
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if not unicodedata.combining(char))


def normalize(value):
    """Comparison key: lowercase, no accents, single spaces."""
    return " ".join(strip_accents(value).casefold().split())


def tokens(text):
    return WORD_RE.findall(text)


def detect_language(text):
    """Return ``"fr"`` or ``"en"`` from stopword frequencies."""
    sample = [token.casefold() for token in tokens(text[:20000])]
    if not sample:
        return "en"
    french = sum(1 for token in sample if token in stopwords.FRENCH)
    english = sum(1 for token in sample if token in stopwords.ENGLISH)
    accents = sum(1 for char in text[:20000] if char in "éèêàùçâîôûëïœ")
    french += accents // 4
    return "fr" if french > english else "en"


def split_sentences(text):
    """Split text into sentences, keeping abbreviations and decimals intact."""
    sentences = []
    for paragraph in re.split(r"\n\s*\n", text):
        paragraph = " ".join(paragraph.split())
        if not paragraph:
            continue
        start = 0
        for match in _SENTENCE_END_RE.finditer(paragraph):
            end = match.end(1)
            previous = paragraph[start:end].rstrip(".").split()
            last_word = previous[-1].casefold().strip("(«\"") if previous else ""
            if match.group(1) == "." and last_word in ABBREVIATIONS:
                continue
            sentences.append(paragraph[start:end].strip())
            start = match.end()
        tail = paragraph[start:].strip()
        if tail:
            sentences.append(tail)
    return sentences


def is_usable_sentence(sentence, min_words=7, max_words=45):
    """Whether a sentence is a reasonable basis for a question."""
    words = tokens(sentence)
    if not (min_words <= len(words) <= max_words):
        return False
    if "?" in sentence or _URL_RE.search(sentence):
        return False
    letters = sum(char.isalpha() for char in sentence)
    if letters < 0.6 * len(sentence):
        return False
    uppercase = sum(char.isupper() for char in sentence if char.isalpha())
    if uppercase > 0.5 * letters:  # headings written in capitals
        return False
    return True
