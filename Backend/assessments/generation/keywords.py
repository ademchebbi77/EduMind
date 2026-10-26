"""Key-phrase extraction and similarity, with an optional local spaCy backend.

The pure-Python backend works everywhere. When spaCy and one of its language
models are already installed, noun chunks and entities from the model are used
as candidates instead; nothing is ever downloaded at runtime.
"""

import importlib.util
import logging
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from . import stopwords
from .text import WORD_RE, normalize

logger = logging.getLogger(__name__)

MAX_PHRASE_TOKENS = 5  # connectors included ("machines à vecteurs de support")
MAX_CONTENT_TOKENS = 4
MAX_PHRASE_CHARS = 60
NUMBER_RE = re.compile(r"^\d+(?:[.,]\d+)?$")
ACRONYM_RE = re.compile(r"^[A-Z][A-Z0-9]{1,6}s?$")
_GAP_RE = re.compile(r"^(?:\s+|\s*['’]\s*)$")  # between words of one phrase

SPACY_MODELS = {
    "fr": ("fr_core_news_md", "fr_core_news_sm", "fr_core_news_lg"),
    "en": ("en_core_web_md", "en_core_web_sm", "en_core_web_lg"),
}
_spacy_cache = {}


def fold(token):
    """Comparison form of a word: accents removed, simple plurals folded."""
    word = normalize(token)
    if len(word) > 4 and word.endswith("eaux"):
        return word[:-1]
    if len(word) > 3 and word.endswith("s") and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    return word


def phrase_key(text):
    return " ".join(fold(token) for token in WORD_RE.findall(text))


def is_plural(surface):
    last = surface.split()[-1] if surface.split() else ""
    return len(last) > 3 and last[-1:] in ("s", "x") and not last.endswith(("ss", "us", "is"))


@dataclass
class Phrase:
    key: str
    surfaces: Counter = field(default_factory=Counter)
    sentences: set = field(default_factory=set)
    count: int = 0
    noun_hits: int = 0
    continued: int = 0
    truncated: int = 0
    kind: str = "term"  # "term", "proper" or "number"
    score: float = 0.0
    context: Counter = field(default_factory=Counter)

    @property
    def surface(self):
        return self.surfaces.most_common(1)[0][0]

    @property
    def forms(self):
        return [form for form, _ in self.surfaces.most_common()]

    def form(self, plural=None):
        """Most common surface form, matching grammatical number when possible."""
        if plural is not None:
            for form in self.forms:
                if is_plural(form) == plural:
                    return form
        return self.surface

    @property
    def token_keys(self):
        return set(self.key.split())

    @property
    def size(self):
        return len(self.key.split())


@dataclass
class Analysis:
    language: str
    sentences: list
    phrases: dict
    engine: str

    def ranked(self):
        return sorted(self.phrases.values(), key=lambda phrase: phrase.score, reverse=True)


def _is_stop(token, language_stopwords):
    lowered = token.casefold()
    return lowered in language_stopwords or lowered in stopwords.ALL


def _kind(tokens_):
    if len(tokens_) == 1 and NUMBER_RE.match(tokens_[0]):
        return "number"
    # Names and acronyms: every content word capitalised ("Frank Rosenblatt",
    # "ReLU"); "score F1" stays a common term.
    content = [token for token in tokens_ if token.casefold() not in stopwords.CONNECTORS]
    if content and all(token[:1].isupper() for token in content):
        return "proper"
    return "term"


def _valid_span(span_tokens, language_stopwords):
    first, last = span_tokens[0], span_tokens[-1]
    if _is_stop(first, language_stopwords) or _is_stop(last, language_stopwords):
        return False
    for token in span_tokens[1:-1]:
        if _is_stop(token, language_stopwords) and token.casefold() not in stopwords.CONNECTORS:
            return False
    content = sum(1 for token in span_tokens if token.casefold() not in stopwords.CONNECTORS)
    if content > MAX_CONTENT_TOKENS:
        return False
    if any(NUMBER_RE.match(token) for token in span_tokens) and len(span_tokens) > 1:
        return False
    if len(span_tokens) == 1:
        token = span_tokens[0]
        if NUMBER_RE.match(token):
            return True
        if token.casefold() in stopwords.GENERIC:
            return False
        if len(token) < 4 and not ACRONYM_RE.match(token):
            return False
    return True


def _pure_python_spans(sentence, language_stopwords):
    matches = list(WORD_RE.finditer(sentence))
    for start_index in range(len(matches)):
        for size in range(1, MAX_PHRASE_TOKENS + 1):
            end_index = start_index + size
            if end_index > len(matches):
                break
            # A phrase never crosses punctuation ("SGD, Momentum" is a list).
            gap = sentence[matches[end_index - 2].end():matches[end_index - 1].start()] if size > 1 else ""
            if gap and not _GAP_RE.match(gap):
                break
            span_tokens = [match.group() for match in matches[start_index:end_index]]
            if _valid_span(span_tokens, language_stopwords):
                yield matches[start_index].start(), matches[end_index - 1].end(), span_tokens


def _load_spacy(language):
    if language in _spacy_cache:
        return _spacy_cache[language]
    nlp = None
    name = None
    if importlib.util.find_spec("spacy") is not None:
        try:
            import spacy

            for candidate in SPACY_MODELS.get(language, ()):
                if spacy.util.is_package(candidate):  # installed locally, no download
                    nlp = spacy.load(candidate)
                    name = candidate
                    break
        except Exception:  # pragma: no cover - depends on the local install
            logger.exception("spaCy is installed but its model could not be loaded")
            nlp = None
    _spacy_cache[language] = (nlp, name)
    return nlp, name


def available_engine(language):
    _, name = _load_spacy(language)
    return f"spacy:{name}" if name else "pure-python"


def _spacy_spans(nlp, sentences, language_stopwords):  # pragma: no cover - optional
    for index, doc in enumerate(nlp.pipe(sentences, batch_size=64)):
        for span in list(doc.noun_chunks) + list(doc.ents):
            words = [token for token in span if not token.is_punct]
            # Trim leading/trailing function words ("the", "les", "une"...).
            while words and _is_stop(words[0].text, language_stopwords):
                words.pop(0)
            while words and _is_stop(words[-1].text, language_stopwords):
                words.pop()
            if not words or len(words) > MAX_PHRASE_TOKENS:
                continue
            span_tokens = [token.text for token in words]
            if _valid_span(span_tokens, language_stopwords):
                yield index, words[0].idx, words[-1].idx + len(words[-1].text), span_tokens
        for token in doc:
            if NUMBER_RE.match(token.text):
                yield index, token.idx, token.idx + len(token.text), [token.text]


def analyse(sentences, language, use_spacy=True):
    """Collect, count and score candidate key phrases."""
    language_stopwords = stopwords.BY_LANGUAGE.get(language, stopwords.ENGLISH)
    phrases = {}
    sentence_tokens = [list(WORD_RE.finditer(sentence)) for sentence in sentences]

    def neighbours(index, start, end):
        matches = sentence_tokens[index]
        before = [match.group() for match in matches if match.end() <= start]
        after = [match.group() for match in matches if match.start() >= end]
        return before, after

    def is_content(token):
        return not _is_stop(token, language_stopwords) and not NUMBER_RE.match(token)

    def record(index, start, end, span_tokens, spacy_noun=False):
        surface = sentences[index][start:end]
        if len(surface) > MAX_PHRASE_CHARS:
            return
        key = phrase_key(surface)
        phrase = phrases.get(key)
        if phrase is None:
            phrase = phrases[key] = Phrase(key=key)
        phrase.count += 1
        phrase.sentences.add(index)

        before, after = neighbours(index, start, end)
        previous = before[-1].casefold() if before else None
        # Sentence subjects count as nouns, but not the first word of a short
        # heading ("Évaluer un modèle").
        is_subject = previous is None and len(sentence_tokens[index]) >= 6
        if spacy_noun or is_subject or previous in stopwords.NOUN_MARKERS:
            phrase.noun_hits += 1
        # The phrase is cut short when a content word directly follows it
        # ("neural" in "neural network"), possibly through a connector.
        if after and (
            is_content(after[0])
            or (after[0].casefold() in stopwords.CONNECTORS and len(after) > 1 and is_content(after[1]))
        ):
            phrase.continued += 1
        if before and before[-1].casefold() in stopwords.CONNECTORS and len(before) > 1 and is_content(before[-2]):
            phrase.truncated += 1  # "vecteurs de support" inside "machines à vecteurs de support"

        if start == 0 and not ACRONYM_RE.match(span_tokens[0]):
            # Sentence-initial capitals say nothing about proper nouns, so the
            # lowercased form only wins when the phrase never appears mid-sentence.
            phrase.surfaces[surface[:1].lower() + surface[1:]] += 0.4
        else:
            phrase.surfaces[surface] += 1

    nlp, model_name = _load_spacy(language) if use_spacy else (None, None)
    if nlp is not None:  # pragma: no cover - optional dependency
        for index, start, end, span_tokens in _spacy_spans(nlp, sentences, language_stopwords):
            record(index, start, end, span_tokens, spacy_noun=True)
        engine = f"spacy:{model_name}"
    else:
        for index, sentence in enumerate(sentences):
            for start, end, span_tokens in _pure_python_spans(sentence, language_stopwords):
                record(index, start, end, span_tokens)
        engine = "pure-python"

    phrases = _filter(phrases)
    _score(phrases, len(sentences))
    _build_contexts(phrases, sentences, language_stopwords)
    return Analysis(language=language, sentences=sentences, phrases=phrases, engine=engine)


def _filter(phrases):
    kept = {}
    for key, phrase in phrases.items():
        phrase.kind = _kind(WORD_RE.findall(phrase.surface))
        if phrase.kind == "number":
            kept[key] = phrase
            continue
        if phrase.kind == "term" and phrase.noun_hits == 0:
            continue  # never used like a noun: probably a verb or adjective
        if phrase.continued >= 0.6 * phrase.count or phrase.truncated >= 0.8 * phrase.count:
            continue  # fragment of a longer phrase
        if phrase.count >= 2 or phrase.kind == "proper":
            kept[key] = phrase
    # Drop sub-phrases that never appear outside a longer kept phrase.
    for key, phrase in list(kept.items()):
        if phrase.kind == "number":
            continue
        for other in kept.values():
            if other is not phrase and other.size > phrase.size and other.count >= phrase.count:
                if f" {key} " in f" {other.key} ":
                    kept.pop(key, None)
                    break
    return kept


def _score(phrases, sentence_count):
    """Frequent but specific phrases first (a per-document TF-IDF)."""
    total = max(1, sentence_count)
    for phrase in phrases.values():
        spread = len(phrase.sentences)
        specificity = math.log(1 + total / spread)
        score = (1 + math.log(phrase.count)) * specificity * (1 + 0.6 * (phrase.size - 1))
        if phrase.kind == "proper":
            score *= 1.2
        elif phrase.kind == "number":
            score *= 0.5
        if min(phrase.sentences) < 0.15 * total:
            score *= 1.1
        phrase.score = round(score, 4)


def _build_contexts(phrases, sentences, language_stopwords):
    sentence_words = [
        [
            fold(token)
            for token in WORD_RE.findall(sentence)
            if not _is_stop(token, language_stopwords) and not NUMBER_RE.match(token)
        ]
        for sentence in sentences
    ]
    members = defaultdict(list)
    for phrase in phrases.values():
        for sentence_index in phrase.sentences:
            members[sentence_index].append(phrase)
    for sentence_index, sentence_phrases in members.items():
        words = sentence_words[sentence_index]
        for phrase in sentence_phrases:
            own = phrase.token_keys
            phrase.context.update(word for word in words if word not in own)


def similarity(first, second):
    """Cosine similarity between two phrases' context vectors."""
    if not getattr(first, "context", None) or not getattr(second, "context", None):
        return 0.0
    common = set(first.context) & set(second.context)
    dot = sum(first.context[word] * second.context[word] for word in common)
    norm = math.sqrt(sum(value * value for value in first.context.values())) * math.sqrt(
        sum(value * value for value in second.context.values())
    )
    return dot / norm if norm else 0.0
