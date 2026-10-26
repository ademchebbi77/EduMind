"""AI services of the summaries module.

- GeminiService: everything that is text (structured summary + key concepts,
  the visual prompt of an illustration, and the course chat answers).
- ImageGeneratorService: turns a visual prompt into a picture.

The API key stays on the server. Provider errors become short messages that are
safe to show to the user; details go to the server log.
"""

import base64
import io
import json
import logging
import random
import re
import time
import urllib.parse

import httpx
from django.conf import settings
from PIL import Image, UnidentifiedImageError

from assessments.generation.extraction import ExtractionError, extract_course
from assessments.generation.text import detect_language

logger = logging.getLogger(__name__)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
POLLINATIONS_URL = "https://image.pollinations.ai/prompt/{prompt}"

LANGUAGE_NAMES = {"fr": "French", "en": "English", "ar": "Arabic"}
ARABIC_RE = re.compile(r"[؀-ۿ]")
MIN_COURSE_WORDS = 30
MAX_IMAGE_BYTES = 10 * 1024 * 1024


class AIServiceError(Exception):
    """An AI call failed. ``message`` is safe to show to the user."""

    def __init__(self, message, *, retryable=True):
        super().__init__(message)
        self.message = message
        self.retryable = retryable


def text_language(text):
    """"ar", "fr" or "en": used for the answers and for the voice of the audio player."""
    if ARABIC_RE.search(text):
        return "ar"
    return detect_language(text)


def course_text(course):
    """Full readable text of a course: its PDF or transcript, else its description."""
    try:
        text = extract_course(course)
    except ExtractionError:
        text = ""
    if len(text.split()) < MIN_COURSE_WORDS:
        text = f"{course.description}\n\n{text}".strip()
    if len(text.split()) < MIN_COURSE_WORDS:
        raise AIServiceError(
            "This course has no readable content yet (no PDF, no transcript and a very short "
            "description), so the AI cannot work on it.",
            retryable=False,
        )
    return text[: settings.SUMMARIES_MAX_COURSE_CHARS]


def _error_for(provider, response):
    """Map an HTTP error of a provider to a safe message."""
    status, body = response.status_code, response.text[:300]
    logger.warning("%s API error %s: %s", provider, status, body)
    if status in (401, 403) or "API key not valid" in body:
        return AIServiceError(
            f"The {provider} service rejected the server's API key. Contact an administrator.",
            retryable=False,
        )
    if status == 429:
        return AIServiceError(f"The {provider} quota is reached. Try again in a minute.")
    if status == 400:
        return AIServiceError(f"The {provider} service could not process this request.", retryable=False)
    return AIServiceError(f"The {provider} service is busy right now. Try again in a moment.")


# --- Gemini (text) -----------------------------------------------------------------

SUMMARY_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "title": {"type": "STRING"},
        "content": {"type": "STRING"},
        "key_concepts": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {"term": {"type": "STRING"}, "definition": {"type": "STRING"}},
                "required": ["term", "definition"],
            },
        },
    },
    "required": ["title", "content", "key_concepts"],
}

SUMMARY_PROMPT = """You summarise university courses for students.
Write a structured summary of the course below, in the language of the course.
- "title": a short title for the summary.
- "content": 250 to 450 words. Start each section with a line "## Section title" and use lines starting with "- " for lists. No other Markdown (no bold, tables or code).
- "key_concepts": the 5 to 10 most important notions of the course, each with a one or two sentence definition taken from the course.
Only use information from the course.

Course title: {title}

Course content:
{text}"""

ILLUSTRATION_PROMPT = """Read this course summary and write ONE prompt, in English, for an image generator.
The image must explain the main idea of the course visually, like a clean educational illustration or diagram for students.
Describe the objects, the composition and the style (flat vector illustration, soft colours, white background).
The image must contain no text, no letters and no numbers.
Answer with the prompt only, at most 70 words.

Summary title: {title}
Summary:
{content}"""

CHAT_PROMPT = """You are the EduMind course assistant, a patient tutor available 24/7.
Answer the student's question using ONLY the course material and summary below.
- Answer in {language}, the language of the question.
- If the course does not cover the question, say so in one sentence and suggest what part of the course to review.
- Plain text, short paragraphs, lists with "- " if useful. No Markdown: no **bold**, headings or tables. At most about 180 words.

Course title: {title}

Course material:
{text}

Summary of the course:
{summary}"""


class GeminiService:
    def __init__(self, api_key=None, models=None):
        self.api_key = api_key if api_key is not None else settings.GEMINI_API_KEY
        self.models = models or settings.SUMMARIES_GEMINI_MODELS

    @property
    def enabled(self):
        return bool(self.api_key)

    def _post(self, model, body):
        try:
            response = httpx.post(
                GEMINI_URL.format(model=model),
                headers={"x-goog-api-key": self.api_key},
                json=body,
                timeout=httpx.Timeout(settings.GEMINI_TIMEOUT_SECONDS, connect=10),
            )
        except httpx.TimeoutException as error:
            raise AIServiceError("The AI service took too long to answer. Try again.") from error
        except httpx.HTTPError as error:
            logger.warning("Gemini request failed: %s", error)
            raise AIServiceError("The AI service could not be reached. Try again.") from error
        if response.status_code != 200:
            raise _error_for("AI", response)

        candidates = response.json().get("candidates") or [{}]
        parts = (candidates[0].get("content") or {}).get("parts") or []
        # The page shows plain text, so Markdown bold marks are removed.
        text = "".join(part.get("text", "") for part in parts).replace("**", "").strip()
        if not text:
            raise AIServiceError("The AI service returned an empty answer. Try again.", retryable=False)
        return text

    def generate(self, prompt, *, system=None, history=(), json_schema=None, temperature=0.4):
        """Send a prompt to Gemini and return ``(text, model)``.

        When a model is busy (503, quota, timeout) the next model of the list is
        tried; the whole list is tried twice before giving up.
        """
        if not self.enabled:
            raise AIServiceError("The AI service is not configured on the server.", retryable=False)
        body = {
            "contents": [*history, {"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": temperature},
        }
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        if json_schema:
            body["generationConfig"]["responseMimeType"] = "application/json"
            body["generationConfig"]["responseSchema"] = json_schema

        last_error = None
        for round_number in range(2):
            if round_number:
                time.sleep(settings.SUMMARIES_RETRY_SECONDS)
            for model in self.models:
                try:
                    return self._post(model, body), model
                except AIServiceError as error:
                    if not error.retryable:
                        raise
                    logger.warning("Gemini model %s failed: %s", model, error.message)
                    last_error = error
        raise last_error

    def summarize(self, course, text=None):
        """Structured summary and key concepts of a course. Returns a dict."""
        prompt = SUMMARY_PROMPT.format(title=course.title, text=text or course_text(course))
        text, model = self.generate(prompt, json_schema=SUMMARY_SCHEMA, temperature=0.3)
        try:
            data = json.loads(text)
        except json.JSONDecodeError as error:
            raise AIServiceError("The AI service returned an invalid summary. Try again.") from error

        content = str(data.get("content") or "").strip()
        if not content:
            raise AIServiceError("The AI service returned an empty summary. Try again.")
        concepts = [
            {"term": str(item["term"]).strip()[:120], "definition": str(item["definition"]).strip()[:600]}
            for item in data.get("key_concepts") or []
            if isinstance(item, dict) and item.get("term") and item.get("definition")
        ][:12]
        return {
            "title": str(data.get("title") or f"Summary of {course.title}").strip()[:200],
            "content": content,
            "key_concepts": concepts,
            "language": text_language(content),
            "ai_model": model,
        }

    def illustration_prompt(self, summary):
        """Step 1 of an illustration: Gemini writes the visual prompt."""
        prompt = ILLUSTRATION_PROMPT.format(title=summary.title, content=summary.content[:6000])
        text, _ = self.generate(prompt, temperature=0.7)
        return " ".join(text.split())[:600]

    def answer(self, summary, question, history=()):
        """Answer a student question with the full course text as context (micro-RAG)."""
        try:
            material = course_text(summary.course)
        except AIServiceError:
            material = "(no course document: rely on the summary)"
        system = CHAT_PROMPT.format(
            language=LANGUAGE_NAMES.get(text_language(question), "the language of the question"),
            title=summary.course.title,
            text=material,
            summary=summary.content,
        )
        turns = []
        for message in history:
            turns.append({"role": "user", "parts": [{"text": message.question}]})
            turns.append({"role": "model", "parts": [{"text": message.answer}]})
        text, _ = self.generate(question, system=system, history=turns)
        return text


# --- Image generation --------------------------------------------------------------


class ImageGeneratorService:
    """Step 2 of an illustration: draw the picture described by the prompt.

    Providers: "pollinations" (free, no key, default) or "gemini" (Gemini image
    model, needs a billed API key).
    """

    def __init__(self, provider=None):
        self.provider = provider or settings.SUMMARIES_IMAGE_PROVIDER

    def generate(self, prompt):
        """Return the picture as JPEG bytes."""
        if self.provider == "gemini":
            data = self._gemini(prompt)
        else:
            data = self._pollinations(prompt)
        return self._to_jpeg(data)

    def _pollinations(self, prompt):
        url = POLLINATIONS_URL.format(prompt=urllib.parse.quote(prompt))
        params = {"width": 1024, "height": 576, "nologo": "true", "seed": random.randint(1, 10**6)}
        try:
            response = httpx.get(
                url, params=params, timeout=settings.SUMMARIES_IMAGE_TIMEOUT_SECONDS, follow_redirects=True
            )
        except httpx.HTTPError as error:
            logger.warning("Image request failed: %s", error)
            raise AIServiceError("The image service could not be reached. Try again.") from error
        if response.status_code != 200:
            raise _error_for("image", response)
        return response.content

    def _gemini(self, prompt):
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["IMAGE"]},
        }
        try:
            response = httpx.post(
                GEMINI_URL.format(model=settings.SUMMARIES_GEMINI_IMAGE_MODEL),
                headers={"x-goog-api-key": settings.GEMINI_API_KEY},
                json=body,
                timeout=settings.SUMMARIES_IMAGE_TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as error:
            logger.warning("Gemini image request failed: %s", error)
            raise AIServiceError("The image service could not be reached. Try again.") from error
        if response.status_code != 200:
            raise _error_for("image", response)
        for candidate in response.json().get("candidates") or []:
            for part in (candidate.get("content") or {}).get("parts") or []:
                if (part.get("inlineData") or {}).get("data"):
                    return base64.b64decode(part["inlineData"]["data"])
        raise AIServiceError("The image service returned no picture. Try again.")

    @staticmethod
    def _to_jpeg(data):
        """Check the bytes really are an image, then re-encode them as a clean JPEG."""
        if not data or len(data) > MAX_IMAGE_BYTES:
            raise AIServiceError("The image service returned an invalid picture. Try again.")
        try:
            image = Image.open(io.BytesIO(data))
            image.load()
        except (UnidentifiedImageError, OSError) as error:
            raise AIServiceError("The image service returned an invalid picture. Try again.") from error
        output = io.BytesIO()
        image.convert("RGB").save(output, format="JPEG", quality=88)
        return output.getvalue()
