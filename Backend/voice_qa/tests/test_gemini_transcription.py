import base64
import io
import json
from unittest import mock

import httpx
from django.test import SimpleTestCase, override_settings

from courses.demo_files import build_wav
from voice_qa import services
from voice_qa.services import ServiceError, transcribe


def gemini_response(payload, status=200):
    body = {"candidates": [{"content": {"parts": [{"text": json.dumps(payload)}]}}]}
    return httpx.Response(status, json=body, request=httpx.Request("POST", "https://example"))


@override_settings(
    VOICE_QA_TRANSCRIPTION_PROVIDER="gemini",
    GEMINI_API_KEY="test-key",
    GEMINI_MODEL="main-model",
    GEMINI_FALLBACK_MODEL="fallback-model",
)
class GeminiTranscriptionTests(SimpleTestCase):
    def setUp(self):
        patcher = mock.patch("voice_qa.services.httpx.post")
        self.post = patcher.start()
        self.addCleanup(patcher.stop)
        self.audio = build_wav(seconds=1.0)

    def run_transcribe(self, language="auto"):
        return transcribe(io.BytesIO(self.audio), "question.wav", "audio/wav", language)

    def test_provider_settings(self):
        self.assertEqual(services.transcription_provider(), "gemini")
        self.assertFalse(services.use_local_whisper())
        self.assertTrue(services.transcription_enabled())
        self.assertEqual(services.transcription_model_label(), "main-model (speech)")
        with override_settings(GEMINI_API_KEY=""):
            self.assertFalse(services.transcription_enabled())

    def test_sends_compressed_mp3_and_returns_text_and_language(self):
        self.post.return_value = gemini_response({"text": " Qu'est-ce qu'une jointure ? ", "language": "fr"})

        text, language = self.run_transcribe(language="fr")

        self.assertEqual((text, language), ("Qu'est-ce qu'une jointure ?", "fr"))
        url = self.post.call_args.args[0]
        body = self.post.call_args.kwargs["json"]
        self.assertIn("main-model", url)
        self.assertEqual(self.post.call_args.kwargs["headers"]["x-goog-api-key"], "test-key")
        audio_part, prompt_part = body["contents"][0]["parts"]
        self.assertEqual(audio_part["inlineData"]["mimeType"], "audio/mp3")
        mp3 = base64.b64decode(audio_part["inlineData"]["data"])
        self.assertTrue(mp3[:3] == b"ID3" or mp3[0] == 0xFF)  # an MP3 header
        self.assertIn("French", prompt_part["text"])
        self.assertEqual(body["generationConfig"]["responseMimeType"], "application/json")

    def test_unknown_language_falls_back_to_detection(self):
        self.post.return_value = gemini_response(
            {"text": "What is a primary key in a database?", "language": "other"}
        )

        _, language = self.run_transcribe()

        self.assertEqual(language, "en")

    def test_empty_transcript_means_no_speech(self):
        self.post.return_value = gemini_response({"text": "", "language": "other"})

        with self.assertRaises(ServiceError) as caught:
            self.run_transcribe()

        self.assertEqual(caught.exception.message, services.NO_SPEECH)
        self.assertFalse(caught.exception.retryable)

    def test_busy_main_model_uses_the_fallback(self):
        busy = httpx.Response(503, text="overloaded", request=httpx.Request("POST", "https://example"))
        self.post.side_effect = [busy, gemini_response({"text": "Hello there", "language": "en"})]

        text, _ = self.run_transcribe()

        self.assertEqual(text, "Hello there")
        self.assertIn("fallback-model", self.post.call_args.args[0])

    def test_rejected_key_is_reported(self):
        self.post.return_value = httpx.Response(
            400, text="API key not valid", request=httpx.Request("POST", "https://example")
        )

        with self.assertRaises(ServiceError) as caught:
            self.run_transcribe()

        self.assertIn("API key", caught.exception.message)
        self.assertEqual(self.post.call_count, 1)

    def test_unreadable_audio_is_rejected_before_calling_gemini(self):
        with self.assertRaises(ServiceError) as caught:
            transcribe(io.BytesIO(b"not audio at all"), "question.webm", "audio/webm")

        self.assertIn("could not be read", caught.exception.message)
        self.post.assert_not_called()

    def test_invalid_json_is_a_retryable_error(self):
        self.post.return_value = httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": "not json"}]}}]},
            request=httpx.Request("POST", "https://example"),
        )

        with self.assertRaises(ServiceError) as caught:
            self.run_transcribe()

        self.assertTrue(caught.exception.retryable)
