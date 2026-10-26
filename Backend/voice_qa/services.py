"""Speech-to-text (OpenAI Whisper API) and course-aware answers (Google Gemini API).

API keys are read from the server settings and only sent to the providers. Any
provider error is turned into a short, user-safe message; details are logged.
"""

import logging
import re
import time
from statistics import mean

import httpx
from django.conf import settings
from django.core.cache import cache

from assessments.generation.extraction import ExtractionError, extract_course
from assessments.generation.keywords import fold
from assessments.generation.stopwords import ALL as STOPWORDS
from assessments.generation.text import WORD_RE, detect_language, split_sentences

from . import local_whisper

logger = logging.getLogger(__name__)

WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

LANGUAGE_NAMES = {"fr": "French", "en": "English", "ar": "Arabic"}
# Whisper's verbose_json reports the language by name.
WHISPER_LANGUAGES = {"french": "fr", "english": "en", "arabic": "ar"}
ARABIC_RE = re.compile(r"[؀-ۿ]")

CHUNK_CHARS = 900
COURSE_TEXT_CACHE_SECONDS = 60 * 60


class ServiceError(Exception):
    """A provider call failed. ``message`` is safe to show to the student."""

    def __init__(self, message, *, retryable=True):
        super().__init__(message)
        self.message = message
        self.retryable = retryable


def use_local_whisper():
    return settings.VOICE_QA_TRANSCRIPTION_PROVIDER != "openai"


def transcription_model_label():
    if use_local_whisper():
        return f"whisper-{settings.VOICE_QA_WHISPER_MODEL} (local)"
    return settings.OPENAI_TRANSCRIBE_MODEL


def transcription_enabled():
    if use_local_whisper():
        return local_whisper.available()
    return bool(settings.OPENAI_API_KEY)


def answers_enabled():
    return bool(settings.GEMINI_API_KEY)


def _timeout():
    return httpx.Timeout(settings.VOICE_QA_REQUEST_TIMEOUT_SECONDS, connect=10)


def _provider_error(provider, response):
    """Map an HTTP error from a provider to a safe message."""
    status = response.status_code
    body = response.text[:300]
    logger.warning("%s API error %s: %s", provider, status, body)
    if status in (401, 403) or "API_KEY_INVALID" in body or "API key not valid" in body:
        return ServiceError(
            f"The {provider} service rejected the server's API key. "
            "Contact an administrator.",
            retryable=False,
        )
    if "insufficient_quota" in body or "credit_balance" in body or "billing" in body.lower():
        return ServiceError(
            f"The {provider} service account has no credit left. Contact an administrator.",
            retryable=False,
        )
    if status == 413:
        return ServiceError("The recording is too large for the speech service.", retryable=False)
    if status == 429:
        return ServiceError(
            f"The {provider} service is busy or its quota is reached. Try again in a moment."
        )
    if status == 400:
        return ServiceError(f"The {provider} service could not process this request.")
    return ServiceError(f"The {provider} service is temporarily unavailable. Try again.")


# --- Whisper -----------------------------------------------------------------------


NO_SPEECH = "No speech was detected in the recording. Speak closer to the microphone and try again."


def transcribe(audio_file, filename, content_type, language_hint="auto"):
    """Return ``(text, language_code)`` for an audio file, with the configured engine."""
    if not transcription_enabled():
        raise ServiceError("Speech recognition is not configured on the server.", retryable=False)
    if not use_local_whisper():
        return _transcribe_openai(audio_file, filename, content_type, language_hint)

    try:
        text, language = local_whisper.transcribe(audio_file.read(), filename, language_hint)
    except local_whisper.LocalTranscriptionError as error:
        raise ServiceError(error.message, retryable=False) from error
    if not text:
        raise ServiceError(NO_SPEECH, retryable=False)
    if not language and language_hint in LANGUAGE_NAMES:
        language = language_hint
    return text, language or question_language(text)


def _transcribe_openai(audio_file, filename, content_type, language_hint):
    """Whisper through the paid OpenAI API (VOICE_QA_TRANSCRIPTION_PROVIDER=openai)."""
    data = {"model": settings.OPENAI_TRANSCRIBE_MODEL, "response_format": "verbose_json"}
    if language_hint in LANGUAGE_NAMES:
        data["language"] = language_hint
    try:
        response = httpx.post(
            WHISPER_URL,
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            data=data,
            files={"file": (filename, audio_file, content_type or "application/octet-stream")},
            timeout=_timeout(),
        )
    except httpx.TimeoutException as error:
        raise ServiceError("The speech service took too long to answer. Try again.") from error
    except httpx.HTTPError as error:
        logger.warning("Whisper request failed: %s", error)
        raise ServiceError("The speech service could not be reached. Try again.") from error

    if response.status_code != 200:
        raise _provider_error("speech", response)

    payload = response.json()
    text = (payload.get("text") or "").strip()
    if not text:
        raise ServiceError(NO_SPEECH, retryable=False)
    language = WHISPER_LANGUAGES.get((payload.get("language") or "").lower(), "")
    if not language and language_hint in LANGUAGE_NAMES:
        language = language_hint
    return text, language or question_language(text)


# --- Course context ----------------------------------------------------------------


def question_language(text, fallback=""):
    if ARABIC_RE.search(text):
        return "ar"
    if len(WORD_RE.findall(text)) < 3 and fallback:
        return fallback
    return detect_language(text)


def _keywords(text):
    return {fold(word) for word in WORD_RE.findall(text) if word.casefold() not in STOPWORDS and len(word) > 2}


def _course_text(course):
    """Readable text of the course (PDF or transcript), cached per course version."""
    key = f"voice_qa:course-text:{course.pk}:{course.updated_at.timestamp()}"
    cached = cache.get(key)
    if cached is not None:
        return cached
    try:
        text = extract_course(course)
        source = "course document"
    except ExtractionError:
        text, source = "", "course description"
    cache.set(key, (text, source), COURSE_TEXT_CACHE_SECONDS)
    return text, source


def course_context(course, question, limit=None):
    """Course description plus the passages most related to the question."""
    limit = limit or settings.VOICE_QA_CONTEXT_CHARS
    text, source = _course_text(course)
    header = f"Course title: {course.title}\nCourse description: {course.description or '—'}"
    if not text:
        return header, source

    # Passages of a few sentences each, so a long paragraph can still be selected in part.
    chunks, current = [], ""
    for sentence in split_sentences(text):
        if current and len(current) + len(sentence) > CHUNK_CHARS:
            chunks.append(current)
            current = ""
        current = f"{current} {sentence}".strip()
    if current:
        chunks.append(current)

    wanted = _keywords(question)
    scored = [
        (len(wanted & _keywords(chunk)), index, chunk) for index, chunk in enumerate(chunks)
    ]
    # Most relevant passages first, then keep them in course order for readability.
    ranked = sorted(scored, key=lambda item: (-item[0], item[1]))
    selected, used = [], len(header)
    for score, index, chunk in ranked:
        if used + len(chunk) > limit:
            continue
        if score == 0 and selected:
            break
        selected.append((index, chunk))
        used += len(chunk)
    passages = "\n\n---\n\n".join(chunk for _, chunk in sorted(selected))
    return f"{header}\n\nCourse material (excerpts):\n{passages}", source


def student_profile(student, course):
    """A short, factual line about the student's progress in this course's quizzes."""
    from assessments.models import QuizAttempt

    scores = list(
        QuizAttempt.objects.filter(student=student, quiz__course=course)
        .exclude(status=QuizAttempt.Status.IN_PROGRESS)
        .values_list("percentage", flat=True)
    )
    name = student.first_name or "the student"
    if not scores:
        return f"Student first name: {name}. No quiz attempts in this course yet."
    return (
        f"Student first name: {name}. Quiz attempts in this course: {len(scores)}, "
        f"average score {mean(float(score) for score in scores):.0f} %."
    )


# --- Gemini -----------------------------------------------------------------------


SYSTEM_PROMPT = """You are EduMind AI, a patient and encouraging tutor on an e-learning platform.
A student asked a question by voice about one course. Answer it using the course material provided.
Rules:
- Answer in {language}, the language of the question.
- Base the answer on the course material. If the material does not cover the question, say so in one sentence, then give a short general explanation.
- Adapt to the student: use their first name once, keep the level simple if their quiz average is low, and end with one concrete suggestion of what to review or practise in the course.
- Plain text only: short paragraphs, lists with "- " if useful. No Markdown headings, bold, tables or code fences.
- At most about 220 words."""


def _gemini_text(payload):
    feedback = payload.get("promptFeedback") or {}
    if feedback.get("blockReason"):
        raise ServiceError(
            "This question could not be answered because it was blocked by the AI safety filters. "
            "Rephrase it and try again.",
            retryable=False,
        )
    candidates = payload.get("candidates") or []
    if not candidates:
        raise ServiceError("The AI service returned no answer. Try again.")
    candidate = candidates[0]
    parts = (candidate.get("content") or {}).get("parts") or []
    text = "".join(part.get("text", "") for part in parts).strip()
    if candidate.get("finishReason") == "SAFETY" or not text:
        raise ServiceError(
            "The AI service could not answer this question. Rephrase it and try again.",
            retryable=False,
        )
    return text


def _call_gemini(model, body):
    try:
        response = httpx.post(
            GEMINI_URL.format(model=model),
            headers={"x-goog-api-key": settings.GEMINI_API_KEY, "Content-Type": "application/json"},
            json=body,
            timeout=httpx.Timeout(settings.GEMINI_TIMEOUT_SECONDS, connect=10),
        )
    except httpx.TimeoutException as error:
        raise ServiceError("The AI service took too long to answer. Try again.") from error
    except httpx.HTTPError as error:
        logger.warning("Gemini request failed: %s", error)
        raise ServiceError("The AI service could not be reached. Try again.") from error

    if response.status_code != 200:
        raise _provider_error("AI", response)
    return _gemini_text(response.json())


def gemini_models():
    models = [settings.GEMINI_MODEL]
    if settings.GEMINI_FALLBACK_MODEL and settings.GEMINI_FALLBACK_MODEL not in models:
        models.append(settings.GEMINI_FALLBACK_MODEL)
    return models


def answer_question(question, course, student, language, history=()):
    """Return ``(answer, context_source, model)`` from Gemini for ``question`` about ``course``.

    Temporary failures (overload, timeout, network) of the main model fall back to
    the fallback model; configuration or safety errors are never retried.
    """
    if not answers_enabled():
        raise ServiceError("AI answers are not configured on the server.", retryable=False)

    context, source = course_context(course, question)
    turns = []
    for previous in history:
        turns.append({"role": "user", "parts": [{"text": previous.question_text}]})
        turns.append({"role": "model", "parts": [{"text": previous.answer}]})
    prompt = (
        f"{student_profile(student, course)}\n\n{context}\n\n"
        f"Student question:\n{question}"
    )
    body = {
        "systemInstruction": {
            "parts": [{"text": SYSTEM_PROMPT.format(language=LANGUAGE_NAMES.get(language, "the question's language"))}]
        },
        "contents": [*turns, {"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 1024},
    }
    last_error = None
    for model in gemini_models():
        try:
            return _call_gemini(model, body), source, model
        except ServiceError as error:
            if not error.retryable:
                raise
            logger.warning("Gemini model %s failed (%s); trying the next model", model, error.message)
            last_error = error
    raise last_error


def timed(function, *args, **kwargs):
    """Run ``function`` and return ``(result, elapsed_ms)``."""
    started = time.perf_counter()
    result = function(*args, **kwargs)
    return result, round((time.perf_counter() - started) * 1000)
