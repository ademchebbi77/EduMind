"""Rule-based quiz generation from course text (French or English).

Every question is grounded in one sentence of the source: the correct answer is
taken from that sentence and the sentence itself becomes the explanation, so a
teacher can always check where a question comes from. Wrong options are other
key phrases of the same document, chosen by context similarity so they are
plausible but never appear in the source sentence.
"""

import random
import re
import time
from dataclasses import asdict, dataclass, field

from . import stopwords
from .keywords import Analysis, analyse, is_plural, phrase_key, similarity
from .text import detect_language, is_usable_sentence, normalize, split_sentences, tokens

SINGLE_CHOICE = "single_choice"
MULTIPLE_CHOICE = "multiple_choice"
TRUE_FALSE = "true_false"
QUESTION_TYPES = (SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE)

# Question kinds and the API type each one produces.
KIND_TYPES = {
    "definition": SINGLE_CHOICE,
    "cloze": SINGLE_CHOICE,
    "true_false": TRUE_FALSE,
    "enumeration": MULTIPLE_CHOICE,
}
# Rarer kinds pick first so their sentences are not used up by blanks.
KIND_WEIGHTS = {"enumeration": 1, "definition": 1, "cloze": 2, "true_false": 1}

DIFFICULTIES = ("beginner", "intermediate", "advanced")
POINTS = {"beginner": 1, "intermediate": 2, "advanced": 3}
BLANK = "_____"
MIN_QUESTIONS = 3
MAX_OPTION_CHARS = 300

TEXTS = {
    "en": {
        "cloze": "Fill in the blank: {sentence}",
        "definition": "Which statement best describes “{term}”?",
        "true_false": "True or false? {sentence}",
        "enumeration": (
            "According to the course, which of the following complete this statement: "
            "“{head} {trigger} …”? (Select all that apply.)"
        ),
        "true": "True",
        "false": "False",
        "explain": "From the course: “{sentence}”",
        "explain_true": "True. The course states: “{sentence}”",
        "explain_false": "False. The course states: “{sentence}”",
        "title": "Quiz: {name}",
        "description": "Generated locally from “{name}”. Review every question before publishing.",
    },
    "fr": {
        "cloze": "Complétez la phrase : {sentence}",
        "definition": "Quelle proposition décrit le mieux « {term} » ?",
        "true_false": "Vrai ou faux ? {sentence}",
        "enumeration": (
            "D'après le cours, quels éléments complètent cette phrase : "
            "« {head} {trigger} … » ? (Plusieurs réponses possibles.)"
        ),
        "true": "Vrai",
        "false": "Faux",
        "explain": "D'après le cours : « {sentence} »",
        "explain_true": "Vrai. Le cours indique : « {sentence} »",
        "explain_false": "Faux. Le cours indique : « {sentence} »",
        "title": "Quiz : {name}",
        "description": "Généré localement à partir de « {name} ». Relisez chaque question avant de publier.",
    },
}

# Only "X is Y" style definitions: their answers are all noun phrases, so the
# options share one grammatical shape and the form never gives the answer away.
DEFINITION_PATTERNS = {
    "en": re.compile(
        r"^(?:(?:A|An|The)\s+)?(?P<term>[^,;:()]{2,60}?)\s+"
        r"(?:is defined as|refers to|is|are|means)\s+(?P<definition>.{15,})$"
    ),
    "fr": re.compile(
        r"^(?:(?:Le|La|Les|Un|Une)\s+|L')?(?P<term>[^,;:()]{2,60}?)\s+"
        r"(?:se définit comme|désignent|désigne|est|sont)\s+(?P<definition>.{15,})$"
    ),
}
# A real definition is a noun phrase: "is *a* method…", not "is *usually* processed…".
DEFINITION_START_RE = re.compile(
    r"^(?:a|an|the|one|un|une|le|la|les|l'|des|du|ce|cette|l’)\b", re.IGNORECASE
)
ELISION_RE = re.compile(r"\b[ldjnmstc]'$|\bqu'$", re.IGNORECASE)
VOWEL_START_RE = re.compile(r"^[aeiouyhàâäéèêëîïôöùûüœ]", re.IGNORECASE)
CONTRAST_RE = re.compile(
    r"\s*(?:;|—| - |,\s*(?:while|whereas|but|alors que|tandis que|mais)\b)\s*", re.IGNORECASE
)
PRONOUN_SUBJECTS = {
    "it", "this", "that", "these", "those", "they", "he", "she", "there", "which", "one",
    "il", "elle", "ils", "elles", "ce", "cela", "ceci", "cette", "cet", "ces", "celui",
    "celle", "on", "qui", "chacun",
}
ENUMERATION_TRIGGERS = {
    "en": r"such as|including|includes|include|for example|for instance|namely|e\.g\.|like",
    "fr": r"tels que|telles que|tel que|telle que|notamment|par exemple|à savoir|comprennent|comme",
}
LIST_SPLIT_RE = re.compile(r",\s*|\s+(?:and|or|et|ou)\s+")
LEADING_CONJUNCTION_RE = re.compile(r"^(?:and|or|et|ou)\s+", re.IGNORECASE)
LEADING_DETERMINER_RE = re.compile(
    r"^(?:the|a|an|le|la|les|l'|un|une|des|du|de la|de l'|d')\s*", re.IGNORECASE
)


class GenerationError(Exception):
    """Not enough usable content. The message is user-facing."""


@dataclass
class GeneratedQuestion:
    text: str
    type: str
    options: list  # [{"text": str, "is_correct": bool}]
    explanation: str
    difficulty: str
    points: int
    kind: str
    sentence_index: int
    answer_key: str
    source: str
    quality: float = 0.0

    def as_payload(self):
        """Shape accepted by the quiz API and the quiz builder."""
        return {
            "text": self.text,
            "type": self.type,
            "points": self.points,
            "explanation": self.explanation,
            "options": [dict(option) for option in self.options],
            "difficulty": self.difficulty,
            "kind": self.kind,
            "source": self.source,
        }


@dataclass
class GenerationResult:
    language: str
    engine: str
    title: str
    description: str
    difficulty: str
    questions: list
    warnings: list = field(default_factory=list)
    stats: dict = field(default_factory=dict)

    def as_dict(self):
        data = asdict(self)
        data["questions"] = [question.as_payload() for question in self.questions]
        return data


@dataclass
class _NumberOption:
    """Numeric distractor that has no occurrence in the text."""

    surface: str

    def form(self, plural=None):
        return self.surface


# --- Helpers -------------------------------------------------------------------


def _trim(text, max_words=30):
    text = CONTRAST_RE.split(text.strip())[0]
    words = text.split()
    if len(words) > max_words:
        text = " ".join(words[:max_words]) + "…"
    return text.rstrip(" .,:")[:MAX_OPTION_CHARS]


def _capitalize(text):
    return text[:1].upper() + text[1:] if text else text


def _ensure_period(sentence):
    sentence = sentence.strip()
    return sentence if sentence.endswith((".", "!", "…")) else f"{sentence}."


def _match_case(candidate, at_start):
    if at_start:
        return _capitalize(candidate)
    first = candidate.split()[0] if candidate.split() else ""
    if first[:1].isupper() and first[1:].islower() and len(first) > 1:
        return candidate  # proper noun: keep its capital
    return candidate


def _distinct(texts):
    seen, result = set(), []
    for text in texts:
        key = normalize(text)
        if key and key not in seen:
            seen.add(key)
            result.append(text)
    return result


def _find(sentence, form):
    """(start, end) of ``form`` in ``sentence`` on word boundaries, if it occurs once."""
    pattern = re.compile(rf"(?<![\w-]){re.escape(form)}(?![\w-])", re.IGNORECASE)
    matches = list(pattern.finditer(sentence))
    if len(matches) != 1:  # absent, or repeated (the other one would reveal the answer)
        return None
    return matches[0].span()


def _contains(container_key, key):
    return f" {key} " in f" {container_key} "


class _Builder:
    def __init__(self, analysis: Analysis, difficulty: str, rng: random.Random):
        self.analysis = analysis
        self.language = analysis.language if analysis.language in TEXTS else "en"
        self.texts = TEXTS[self.language]
        self.difficulty = difficulty
        self.rng = rng
        self.ranked = analysis.ranked()
        self.max_score = self.ranked[0].score if self.ranked else 1.0

    # -- distractors --

    def distractors(self, answer, sentence, count=3, exclude=(), plural=None, elided=False):
        sentence_key = phrase_key(sentence)
        excluded = {phrase_key(text) for text in exclude}
        candidates = []
        for phrase in self.ranked:
            if phrase.key == answer.key or phrase.key in excluded:
                continue
            if phrase.token_keys & answer.token_keys or _contains(sentence_key, phrase.key):
                continue
            # Same kind only: a name is never replaced by a concept, nor a number by a word.
            if phrase.kind != answer.kind:
                continue
            if answer.kind != "number" and abs(phrase.size - answer.size) > 1:
                continue
            ratio = len(phrase.surface) / max(1, len(answer.surface))
            if not 0.4 <= ratio <= 2.5:
                continue
            score = similarity(answer, phrase)
            form = phrase.form(plural)
            if plural is not None and is_plural(form) != plural:
                score -= 0.5  # prefer options with the same grammatical number
            if elided and not VOWEL_START_RE.match(form):
                score -= 0.5  # "l'_____" reads best with a vowel
            candidates.append((score, phrase))

        candidates.sort(key=lambda item: item[0], reverse=True)
        if self.difficulty == "beginner":
            pool = candidates[count:] if len(candidates) >= 2 * count else candidates
            picked = pool[:count]
        elif self.difficulty == "advanced":
            picked = candidates[:count]
        else:
            top = candidates[: count * 2]
            picked = self.rng.sample(top, min(count, len(top)))
        result = [phrase for _, phrase in picked]
        mean = sum(max(score, 0) for score, _ in picked) / len(picked) if picked else 0.0

        if answer.kind == "number" and len(result) < count:
            result += self._number_variants(answer.surface, count - len(result), sentence_key)
        return result, mean

    @staticmethod
    def _number_variants(surface, needed, sentence_key):
        value = float(surface.replace(",", "."))
        is_int = value.is_integer()
        is_year = is_int and 1000 <= value <= 2100
        steps = [1, -1, 2, -2, 5, -5, 10, -10] if is_year else [2, 0.5, 1.5, 10, 3, 0.1]
        variants = []
        for step in steps:
            candidate = value + step if is_year else value * step
            if candidate == value or candidate <= 0:
                continue
            text = str(int(candidate)) if float(candidate).is_integer() else f"{candidate:g}"
            if "," in surface:
                text = text.replace(".", ",")
            if _contains(sentence_key, text) or text in variants:
                continue
            variants.append(text)
            if len(variants) == needed:
                break
        return [_NumberOption(text) for text in variants]

    # -- fill in the blank & true/false --

    def blank_candidates(self):
        """(index, sentence, phrase, (start, end)) for the best blank of each sentence."""
        by_sentence = {}
        for phrase in self.ranked:
            for index in phrase.sentences:
                by_sentence.setdefault(index, []).append(phrase)
        for index, phrases in sorted(by_sentence.items()):
            sentence = self.analysis.sentences[index]
            if not is_usable_sentence(sentence):
                continue
            located = []
            for phrase in phrases:
                for form in phrase.forms:
                    span = _find(sentence, form)
                    if span:
                        located.append((phrase, span))
                        break
            # A phrase nested inside a longer located phrase is never the blank
            # ("layer" inside "input layer").
            located = [
                (phrase, span)
                for phrase, span in located
                if not any(
                    other is not phrase and other_span[0] <= span[0] and span[1] <= other_span[1]
                    and other_span != span
                    for other, other_span in located
                )
            ]
            located.sort(key=lambda item: (item[0].score, item[0].size), reverse=True)
            word_count = len(tokens(sentence))
            for phrase, span in located:
                if len(tokens(sentence[span[0]:span[1]])) <= 0.4 * word_count:
                    yield index, sentence, phrase, span
                    break

    def cloze(self, index, sentence, phrase, span):
        original = sentence[span[0]:span[1]]
        plural = is_plural(original)
        elided = bool(ELISION_RE.search(sentence[:span[0]]))
        found, mean_similarity = self.distractors(phrase, sentence, plural=plural, elided=elided)
        if len(found) < 2:
            return None
        at_start = span[0] == 0
        options = [{"text": _match_case(original, at_start), "is_correct": True}]
        options += [
            {"text": _match_case(item.form(plural), at_start), "is_correct": False}
            for item in found
        ]
        options = self._clean_options(options)
        if options is None:
            return None
        blanked = f"{sentence[:span[0]]}{BLANK}{sentence[span[1]:]}"
        return self._question(
            kind="cloze",
            text=self.texts["cloze"].format(sentence=_ensure_period(blanked)),
            options=options,
            explanation=self.texts["explain"].format(sentence=sentence),
            difficulty=self._blank_level(phrase, mean_similarity),
            index=index,
            answer_key=phrase.key,
            phrase=phrase,
            source=sentence,
        )

    def true_false(self, index, sentence, phrase, span, make_false):
        statement = sentence
        if make_false:
            original = sentence[span[0]:span[1]]
            plural = is_plural(original)
            elided = bool(ELISION_RE.search(sentence[:span[0]]))
            found, _ = self.distractors(phrase, sentence, count=3, plural=plural, elided=elided)
            if not found:
                return None
            # A moderately related term: close enough to be tempting, far enough
            # not to make the statement accidentally true.
            replacement = found[min(1, len(found) - 1)].form(plural)
            statement = (
                f"{sentence[:span[0]]}{_match_case(replacement, span[0] == 0)}{sentence[span[1]:]}"
            )
        options = [
            {"text": self.texts["true"], "is_correct": not make_false},
            {"text": self.texts["false"], "is_correct": make_false},
        ]
        return self._question(
            kind="true_false",
            text=self.texts["true_false"].format(sentence=_ensure_period(statement)),
            options=options,
            explanation=self.texts["explain_false" if make_false else "explain_true"].format(
                sentence=sentence
            ),
            difficulty="beginner" if phrase.count >= 3 else "intermediate",
            index=index,
            answer_key=phrase.key,
            phrase=phrase,
            source=sentence,
            shuffle=False,
        )

    # -- definitions --

    def definitions(self):
        pattern = DEFINITION_PATTERNS[self.language]
        found = []
        for index, sentence in enumerate(self.analysis.sentences):
            if not is_usable_sentence(sentence, min_words=6, max_words=50):
                continue
            match = pattern.match(sentence.strip())
            if not match:
                continue
            term = match.group("term").strip()
            words = term.split()
            if not words or len(words) > 6 or words[0].casefold() in PRONOUN_SUBJECTS:
                continue
            if all(word.casefold() in stopwords.ALL for word in words):
                continue
            body = _trim(match.group("definition"))
            if len(body.split()) < 3 or not DEFINITION_START_RE.match(body):
                continue
            # Show the term as the text usually writes it, not with its
            # sentence-initial capital ("Cross-entropy" → "cross-entropy").
            known = self.analysis.phrases.get(phrase_key(term))
            if known is not None:
                term = known.surface
            found.append((index, sentence, term, _capitalize(body)))
        return found

    def definition(self, item, others):
        index, sentence, term, answer = item
        wrong = [
            other[3]
            for other in others
            if phrase_key(other[2]) != phrase_key(term) and normalize(other[3]) != normalize(answer)
        ]
        self.rng.shuffle(wrong)
        if len(wrong) < 2:
            return None
        options = [{"text": answer, "is_correct": True}]
        options += [{"text": text, "is_correct": False} for text in wrong[:3]]
        options = self._clean_options(options)
        if options is None:
            return None
        return self._question(
            kind="definition",
            text=self.texts["definition"].format(term=term),
            options=options,
            explanation=self.texts["explain"].format(sentence=sentence),
            difficulty="beginner",
            index=index,
            answer_key=phrase_key(term),
            phrase=self.analysis.phrases.get(phrase_key(term)),
            source=sentence,
        )

    # -- lists --

    def enumerations(self):
        trigger = ENUMERATION_TRIGGERS.get(self.language, ENUMERATION_TRIGGERS["en"])
        pattern = re.compile(
            rf"^(?P<head>.+?),?\s+(?P<trigger>{trigger})\s*:?\s+(?P<items>[^:]+?)[.!]?$",
            re.IGNORECASE,
        )
        found = []
        for index, sentence in enumerate(self.analysis.sentences):
            if not is_usable_sentence(sentence, min_words=6, max_words=60):
                continue
            match = pattern.match(sentence.strip())
            if not match:
                continue
            items = []
            for raw in LIST_SPLIT_RE.split(match.group("items")):
                item = LEADING_CONJUNCTION_RE.sub("", raw.strip(" .;()«»\""))
                item = LEADING_DETERMINER_RE.sub("", item).strip()
                if item:
                    items.append(item)
            items = _distinct(items)
            if not 2 <= len(items) <= 6:
                continue
            lengths = [len(item.split()) for item in items]
            # The list must end the sentence: a long last item means the clause
            # continues ("dropout and early stopping help to prevent…").
            if max(lengths) > 5 or lengths[-1] > max(lengths[:-1]) + 1:
                continue
            head_words = match.group("head").split()
            if len(head_words) < 2:
                continue
            head = " ".join(head_words[-15:])
            if len(head_words) > 15:
                head = f"… {head}"
            found.append((index, sentence, head, match.group("trigger"), items))
        return found

    def enumeration(self, item):
        index, sentence, head, trigger, items = item
        correct = items[:4]
        anchors = [self.analysis.phrases.get(phrase_key(text)) for text in correct]
        anchors = [anchor for anchor in anchors if anchor is not None]
        if not anchors:
            return None
        found, _ = self.distractors(anchors[0], sentence, count=3, exclude=correct)
        found = [phrase for phrase in found if phrase.kind == anchors[0].kind or phrase.kind == "term"]
        if len(found) < 2:
            return None
        options = [{"text": text, "is_correct": True} for text in correct]
        options += [{"text": phrase.surface, "is_correct": False} for phrase in found[:3]]
        options = self._clean_options(options)
        if options is None:
            return None
        return self._question(
            kind="enumeration",
            text=self.texts["enumeration"].format(head=head.rstrip(","), trigger=trigger),
            options=options,
            explanation=self.texts["explain"].format(sentence=sentence),
            difficulty="intermediate" if len(correct) <= 3 else "advanced",
            index=index,
            answer_key=phrase_key(head),
            phrase=anchors[0],
            source=sentence,
        )

    # -- shared --

    @staticmethod
    def _blank_level(phrase, mean_similarity):
        level = 0 if phrase.count >= 4 else 1 if phrase.count >= 2 else 2
        if mean_similarity >= 0.35:
            level += 1
        return DIFFICULTIES[min(level, 2)]

    @staticmethod
    def _clean_options(options):
        seen, result = set(), []
        for option in options:
            text = option["text"].strip()[:MAX_OPTION_CHARS]
            key = normalize(text)
            if not key or key in seen:
                continue
            seen.add(key)
            result.append({"text": text, "is_correct": option["is_correct"]})
        if len(result) < 3 or not any(option["is_correct"] for option in result):
            return None
        return result

    def _question(self, *, kind, text, options, explanation, difficulty, index, answer_key,
                  phrase, source, shuffle=True):
        if shuffle:
            self.rng.shuffle(options)
        relevance = phrase.score / self.max_score if phrase is not None else 0.5
        fit = 1 - min(abs(len(tokens(source)) - 20), 20) / 40
        return GeneratedQuestion(
            text=text,
            type=KIND_TYPES[kind],
            options=options,
            explanation=explanation,
            difficulty=difficulty,
            points=POINTS[difficulty],
            kind=kind,
            sentence_index=index,
            answer_key=answer_key,
            source=source,
            quality=round(0.6 * relevance + 0.4 * fit, 4),
        )


def _build_pool(builder, types):
    pool = {kind: [] for kind in KIND_TYPES}

    if SINGLE_CHOICE in types:
        found = builder.definitions()
        pool["definition"] = [q for q in (builder.definition(item, found) for item in found) if q]

    make_false = True
    for index, sentence, phrase, span in builder.blank_candidates():
        if SINGLE_CHOICE in types:
            question = builder.cloze(index, sentence, phrase, span)
            if question:
                pool["cloze"].append(question)
        if TRUE_FALSE in types:
            question = builder.true_false(index, sentence, phrase, span, make_false)
            if question:
                pool["true_false"].append(question)
                make_false = not make_false  # keep true and false answers balanced

    if MULTIPLE_CHOICE in types:
        pool["enumeration"] = [
            q for q in (builder.enumeration(item) for item in builder.enumerations()) if q
        ]
    return pool


def _select(pool, count, difficulty):
    def preference(question):
        if difficulty == "mixed":
            return 0
        return abs(DIFFICULTIES.index(question.difficulty) - DIFFICULTIES.index(difficulty))

    queues = {
        kind: sorted(questions, key=lambda q: (preference(q), -q.quality))
        for kind, questions in pool.items()
        if questions
    }
    used_sentences, used_answers, selected = set(), set(), []

    def take(kind):
        queue = queues[kind]
        while queue:
            question = queue.pop(0)
            if question.sentence_index in used_sentences or question.answer_key in used_answers:
                continue
            used_sentences.add(question.sentence_index)
            used_answers.add(question.answer_key)
            selected.append(question)
            return True
        return False

    while len(selected) < count and any(queues.values()):
        progressed = False
        for kind in KIND_WEIGHTS:
            if kind not in queues:
                continue
            for _ in range(KIND_WEIGHTS[kind]):
                if len(selected) < count and take(kind):
                    progressed = True
        if not progressed:
            break
    selected.sort(key=lambda question: question.sentence_index)  # follow the course order
    return selected


def generate_quiz(text, *, num_questions=10, difficulty="mixed", types=QUESTION_TYPES,
                  source_name="", seed=None, use_spacy=True, on_stage=None):
    """Generate quiz questions from ``text``. Raises GenerationError.

    ``on_stage`` is called with ``"analysing"`` then ``"generating"`` so a
    background job can report its progress.
    """
    notify = on_stage or (lambda stage: None)
    types = tuple(type_ for type_ in QUESTION_TYPES if type_ in set(types)) or QUESTION_TYPES
    if difficulty not in (*DIFFICULTIES, "mixed"):
        raise ValueError("Unknown difficulty.")
    started = time.perf_counter()

    language = detect_language(text)
    sentences = split_sentences(text)
    usable = sum(1 for sentence in sentences if is_usable_sentence(sentence))
    if usable < MIN_QUESTIONS:
        raise GenerationError(
            "The document does not contain enough text to build a quiz. "
            "Use a longer course document."
        )

    notify("analysing")
    analysis = analyse(sentences, language, use_spacy=use_spacy)
    analysed = time.perf_counter()

    notify("generating")
    builder = _Builder(
        analysis, "intermediate" if difficulty == "mixed" else difficulty, random.Random(seed)
    )
    pool = _build_pool(builder, types)
    questions = _select(pool, num_questions, difficulty)
    finished = time.perf_counter()

    if len(questions) < MIN_QUESTIONS:
        raise GenerationError(
            "Not enough distinct key ideas were found to build a quiz from this document."
        )

    warnings = []
    if len(questions) < num_questions:
        warnings.append(
            f"Only {len(questions)} good questions could be generated (requested {num_questions})."
        )
    for type_ in types:
        if not any(pool[kind] for kind, kind_type in KIND_TYPES.items() if kind_type == type_):
            warnings.append(f"No {type_.replace('_', ' ')} questions could be built from this text.")

    texts = TEXTS[builder.language]
    name = source_name or ("le document" if builder.language == "fr" else "the document")
    levels = {question.difficulty for question in questions}
    if difficulty == "mixed":
        difficulty = levels.pop() if len(levels) == 1 else "intermediate"
    return GenerationResult(
        language=language,
        engine=analysis.engine,
        title=texts["title"].format(name=name)[:200],
        description=texts["description"].format(name=name),
        difficulty=difficulty,
        questions=questions,
        warnings=warnings,
        stats={
            "characters": len(text),
            "sentences": len(sentences),
            "usable_sentences": usable,
            "key_phrases": len(analysis.phrases),
            "pool": {kind: len(questions) for kind, questions in pool.items()},
            "analysis_ms": round((analysed - started) * 1000, 1),
            "generation_ms": round((finished - analysed) * 1000, 1),
        },
    )
