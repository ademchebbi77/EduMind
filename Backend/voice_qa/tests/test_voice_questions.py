"""Voice questions: Whisper + Gemini integrations (HTTP mocked in tests only) and API."""

import json
from datetime import timedelta
from unittest import mock

import httpx
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from kombu.exceptions import OperationalError
from rest_framework.test import APITestCase

from accounts.models import User
from assessments.tests.test_generation_engine import ENGLISH, text_pdf
from assessments.tests.utils import create_quiz
from assessments.models import QuizAttempt
from config.celery import app as celery_app
from courses.tests.utils import TemporaryMediaMixin, create_course
from courses.demo_files import build_wav
from voice_qa import local_whisper, services
from voice_qa.models import VoiceQuestion

URL = "/api/voice-questions/"
WEBM = (
    b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01\x42\xf7\x81\x01\x42\xf2\x81\x04\x42\xf3\x81\x08"
    b"\x42\x82\x84webm\x42\x87\x81\x04\x42\x85\x81\x02" + b"\x00" * 300
)
KEYS = {
    "OPENAI_API_KEY": "sk-test-openai",
    "GEMINI_API_KEY": "gm-test-gemini",
    "VOICE_QA_TRANSCRIPTION_PROVIDER": "openai",
}


def response(status=200, payload=None, text=None):
    request = httpx.Request("POST", "https://example.test")
    if text is not None:
        return httpx.Response(status, text=text, request=request)
    return httpx.Response(status, json=payload or {}, request=request)


def whisper_ok(text="What is the learning rate?", language="english"):
    return response(payload={"text": text, "language": language, "duration": 3.2})


def gemini_ok(text="Sofia, the learning rate controls the size of each update."):
    return response(payload={"candidates": [{"content": {"parts": [{"text": text}]}, "finishReason": "STOP"}]})


def fake_provider(whisper=None, gemini=None):
    """Route httpx.post to the right fake provider response."""

    def post(url, **kwargs):
        if "openai.com" in url:
            return whisper or whisper_ok()
        return gemini or gemini_ok()

    return post


def webm_upload(name="question.webm", content=WEBM, content_type="audio/webm;codecs=opus"):
    return SimpleUploadedFile(name, content, content_type=content_type)


# --- Provider integrations ---------------------------------------------------------


@override_settings(**KEYS, OPENAI_TRANSCRIBE_MODEL="whisper-1", GEMINI_MODEL="gemini-test")
class WhisperTests(SimpleTestCase):
    def test_sends_audio_with_key_model_and_language_hint(self):
        with mock.patch("voice_qa.services.httpx.post", return_value=whisper_ok()) as post:
            text, language = services.transcribe(b"audio", "q.webm", "audio/webm", "fr")

        self.assertEqual((text, language), ("What is the learning rate?", "en"))
        url, kwargs = post.call_args.args[0], post.call_args.kwargs
        self.assertEqual(url, services.WHISPER_URL)
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer sk-test-openai")
        self.assertEqual(kwargs["data"], {"model": "whisper-1", "response_format": "verbose_json", "language": "fr"})
        self.assertEqual(kwargs["files"]["file"][0], "q.webm")

    def test_automatic_language_is_not_sent(self):
        with mock.patch("voice_qa.services.httpx.post", return_value=whisper_ok()) as post:
            services.transcribe(b"audio", "q.webm", "audio/webm", "auto")
        self.assertNotIn("language", post.call_args.kwargs["data"])

    def test_arabic_transcription(self):
        with mock.patch(
            "voice_qa.services.httpx.post",
            return_value=whisper_ok("ما هو معدل التعلم؟", "arabic"),
        ):
            self.assertEqual(services.transcribe(b"a", "q.webm", "audio/webm")[1], "ar")

    def test_errors_are_safe_messages(self):
        cases = [
            (response(401, {"error": {"message": "Incorrect API key provided: sk-test..."}}), "API key", False),
            (response(429, {"error": {"message": "quota"}}), "busy", True),
            (
                response(429, {"error": {"type": "insufficient_quota", "code": "credit_balance_exhausted"}}),
                "no credit left",
                False,
            ),
            (response(413, text="too large"), "too large", False),
            (response(500, text="oops"), "temporarily unavailable", True),
            (whisper_ok(text="   "), "No speech", False),
        ]
        for fake, expected, retryable in cases:
            with self.subTest(expected=expected):
                with mock.patch("voice_qa.services.httpx.post", return_value=fake):
                    with self.assertRaises(services.ServiceError) as raised:
                        services.transcribe(b"a", "q.webm", "audio/webm")
                self.assertIn(expected, raised.exception.message)
                self.assertNotIn("sk-test", raised.exception.message)
                self.assertEqual(raised.exception.retryable, retryable)

    def test_network_failures(self):
        for error, expected in [
            (httpx.ReadTimeout("slow"), "too long"),
            (httpx.ConnectError("down"), "could not be reached"),
        ]:
            with self.subTest(expected=expected):
                with mock.patch("voice_qa.services.httpx.post", side_effect=error):
                    with self.assertRaisesMessage(services.ServiceError, expected):
                        services.transcribe(b"a", "q.webm", "audio/webm")

    @override_settings(OPENAI_API_KEY="")
    def test_missing_key(self):
        with self.assertRaisesMessage(services.ServiceError, "not configured"):
            services.transcribe(b"a", "q.webm", "audio/webm")


class LanguageTests(SimpleTestCase):
    def test_question_language(self):
        self.assertEqual(services.question_language("ما هو معدل التعلم في الشبكات العصبية؟"), "ar")
        self.assertEqual(services.question_language("Qu'est-ce que la descente de gradient dans le cours ?"), "fr")
        self.assertEqual(services.question_language("What does the learning rate control in training?"), "en")
        self.assertEqual(services.question_language("ReLU ?", fallback="fr"), "fr")


@override_settings(**KEYS, GEMINI_MODEL="gemini-test")
class GeminiTests(TemporaryMediaMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.teacher = User.objects.create_user(email="t@example.com", password="x", role="teacher")
        self.student = User.objects.create_user(
            email="s@example.com", password="x", role="student", first_name="Sofia"
        )
        lines = [line for line in ENGLISH.splitlines() if line.strip()]
        self.course = create_course(
            self.teacher, title="Neural networks", description="Intro course",
            filename="nn.pdf", content=text_pdf(lines),
        )

    def test_course_context_keeps_relevant_passages(self):
        context, source = services.course_context(self.course, "What does dropout do?", limit=1500)

        self.assertEqual(source, "course document")
        self.assertIn("Course title: Neural networks", context)
        self.assertIn("Dropout randomly disables", context)
        self.assertLessEqual(len(context), 1700)

    def test_course_without_text_uses_description(self):
        audio = create_course(self.teacher, title="Podcast", description="About AI", filename="p.wav")

        context, source = services.course_context(audio, "What is AI?")

        self.assertEqual(source, "course description")
        self.assertIn("About AI", context)

    def test_request_contains_course_profile_language_and_history(self):
        quiz = create_quiz(self.course)
        QuizAttempt.objects.create(quiz=quiz, student=self.student, status="submitted", percentage=40)
        previous = VoiceQuestion(question_text="What is a neuron?", answer="A neuron computes a weighted sum.")

        with mock.patch("voice_qa.services.httpx.post", return_value=gemini_ok()) as post:
            answer, source, model = services.answer_question(
                "Explique le learning rate de ce cours", self.course, self.student, "fr", [previous]
            )

        self.assertEqual(answer, "Sofia, the learning rate controls the size of each update.")
        self.assertEqual(source, "course document")
        self.assertEqual(model, "gemini-test")
        url, kwargs = post.call_args.args[0], post.call_args.kwargs
        self.assertIn("models/gemini-test:generateContent", url)
        self.assertEqual(kwargs["headers"]["x-goog-api-key"], "gm-test-gemini")
        body = kwargs["json"]
        self.assertIn("Answer in French", body["systemInstruction"]["parts"][0]["text"])
        roles = [turn["role"] for turn in body["contents"]]
        self.assertEqual(roles, ["user", "model", "user"])
        prompt = body["contents"][-1]["parts"][0]["text"]
        self.assertIn("Student first name: Sofia", prompt)
        self.assertIn("average score 40 %", prompt)
        self.assertIn("learning rate controls the size", prompt)  # relevant course passage
        self.assertTrue(prompt.endswith("Explique le learning rate de ce cours"))

    def test_blocked_or_empty_answers(self):
        for payload, expected in [
            ({"promptFeedback": {"blockReason": "SAFETY"}}, "safety"),
            ({"candidates": []}, "no answer"),
            ({"candidates": [{"content": {"parts": []}, "finishReason": "SAFETY"}]}, "could not answer"),
        ]:
            with self.subTest(expected=expected):
                with mock.patch("voice_qa.services.httpx.post", return_value=response(payload=payload)):
                    with self.assertRaisesMessage(services.ServiceError, expected):
                        services.answer_question("Why?", self.course, self.student, "en")

    def test_invalid_key_is_not_retryable_and_not_retried(self):
        fake = response(400, text='{"error": {"message": "API key not valid. Please pass a valid API key."}}')
        with mock.patch("voice_qa.services.httpx.post", return_value=fake) as post:
            with self.assertRaises(services.ServiceError) as raised:
                services.answer_question("Why?", self.course, self.student, "en")
        self.assertFalse(raised.exception.retryable)
        self.assertNotIn("gm-test", raised.exception.message)
        self.assertEqual(post.call_count, 1)

    @override_settings(GEMINI_FALLBACK_MODEL="gemini-fallback")
    def test_overloaded_model_falls_back(self):
        overloaded = response(503, {"error": {"status": "UNAVAILABLE", "message": "high demand"}})
        for first in (overloaded, httpx.ReadTimeout("slow")):
            with self.subTest(first=type(first).__name__):
                with mock.patch(
                    "voice_qa.services.httpx.post", side_effect=[first, gemini_ok("Fallback answer.")]
                ) as post:
                    answer, _, model = services.answer_question("Why?", self.course, self.student, "en")
                self.assertEqual((answer, model), ("Fallback answer.", "gemini-fallback"))
                self.assertIn("models/gemini-fallback:", post.call_args_list[1].args[0])

    @override_settings(GEMINI_FALLBACK_MODEL="gemini-fallback")
    def test_both_models_down(self):
        overloaded = response(503, {"error": {"status": "UNAVAILABLE"}})
        with mock.patch("voice_qa.services.httpx.post", return_value=overloaded) as post:
            with self.assertRaisesMessage(services.ServiceError, "temporarily unavailable"):
                services.answer_question("Why?", self.course, self.student, "en")
        self.assertEqual(post.call_count, 2)


# --- API ------------------------------------------------------------------------------


@override_settings(**KEYS, PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class VoiceQuestionApiTests(TemporaryMediaMixin, APITestCase):
    def setUp(self):
        super().setUp()
        previous = celery_app.conf.task_always_eager
        celery_app.conf.update(CELERY_TASK_ALWAYS_EAGER=True)
        self.addCleanup(celery_app.conf.update, CELERY_TASK_ALWAYS_EAGER=previous)

        self.teacher = User.objects.create_user(email="t@example.com", password="x", role="teacher")
        self.student = User.objects.create_user(
            email="s@example.com", password="x", role="student", first_name="Sofia"
        )
        self.other = User.objects.create_user(email="o@example.com", password="x", role="student")
        lines = [line for line in ENGLISH.splitlines() if line.strip()]
        self.course = create_course(self.teacher, title="Neural networks", filename="nn.pdf", content=text_pdf(lines))
        self.client.force_login(self.student)
        patcher = mock.patch("voice_qa.services.httpx.post", side_effect=fake_provider())
        self.post = patcher.start()
        self.addCleanup(patcher.stop)

    def upload(self, **data):
        payload = {"course": self.course.pk, "audio": webm_upload(), **data}
        return self.client.post(URL, payload, format="multipart")

    def ask(self, question_id, text="What is the learning rate?"):
        return self.client.post(f"{URL}{question_id}/ask/", {"question_text": text}, format="json")

    def test_config(self):
        data = self.client.get(f"{URL}config/").json()

        self.assertTrue(data["enabled"])
        self.assertEqual(data["max_audio_mb"], 25)
        self.assertIn("webm", data["audio_extensions"])
        self.assertNotIn("sk-test", json.dumps(data))

    def test_full_flow_record_transcribe_edit_and_answer(self):
        created = self.upload(language="en")
        self.assertEqual(created.status_code, 202, created.json())
        data = created.json()
        self.assertEqual(data["status"], "transcribed")
        self.assertEqual(data["transcript"], "What is the learning rate?")
        self.assertEqual(data["detected_language"], "en")
        self.assertIsNotNone(data["transcription_ms"])

        answered = self.ask(data["id"], "What does the learning rate control?").json()

        self.assertEqual(answered["status"], "answered")
        self.assertEqual(answered["question_text"], "What does the learning rate control?")
        self.assertEqual(answered["transcript"], "What is the learning rate?")  # original kept
        self.assertTrue(answered["answer"].startswith("Sofia"))
        self.assertEqual(answered["answer_language"], "en")
        self.assertEqual(answered["context_source"], "course document")
        self.assertEqual(VoiceQuestion.objects.get().answer_model, "gemini-3.5-flash")
        gemini_call = self.post.call_args_list[-1]
        prompt = gemini_call.kwargs["json"]["contents"][-1]["parts"][0]["text"]
        self.assertTrue(prompt.endswith("What does the learning rate control?"))

    def test_follow_up_includes_previous_answer(self):
        first = self.upload().json()
        self.ask(first["id"])
        second = self.upload().json()
        self.ask(second["id"], "Can you give an example?")

        contents = self.post.call_args_list[-1].kwargs["json"]["contents"]
        self.assertEqual([turn["role"] for turn in contents], ["user", "model", "user"])
        self.assertEqual(contents[0]["parts"][0]["text"], "What is the learning rate?")

    def test_audio_validation(self):
        cases = [
            webm_upload(name="notes.txt", content_type="text/plain"),
            webm_upload(content=b"not audio at all" * 10),
            webm_upload(content=b""),
            SimpleUploadedFile("question.webm", WEBM, content_type="application/pdf"),
        ]
        for audio in cases:
            with self.subTest(name=audio.name):
                result = self.client.post(URL, {"course": self.course.pk, "audio": audio}, format="multipart")
                self.assertEqual(result.status_code, 400)
                self.assertIn("audio", result.json()["error"]["fields"])
        self.assertFalse(VoiceQuestion.objects.exists())

    @override_settings(VOICE_QA_MAX_AUDIO_MB=0)
    def test_audio_size_limit(self):
        self.assertEqual(self.upload().status_code, 400)

    def test_requires_course_and_authentication(self):
        missing = self.client.post(URL, {"audio": webm_upload()}, format="multipart")
        self.assertIn("course", missing.json()["error"]["fields"])
        self.client.logout()
        self.assertEqual(self.upload().status_code, 401)

    @override_settings(OPENAI_API_KEY="")
    def test_missing_openai_key(self):
        result = self.upload()

        self.assertEqual(result.status_code, 503)
        self.assertIn("OPENAI_API_KEY", result.json()["error"]["message"])
        self.assertFalse(VoiceQuestion.objects.exists())

    def test_missing_gemini_key_when_asking(self):
        question_id = self.upload().json()["id"]
        with override_settings(GEMINI_API_KEY=""):
            result = self.ask(question_id)
        self.assertEqual(result.status_code, 503)
        self.assertIn("GEMINI_API_KEY", result.json()["error"]["message"])

    def test_transcription_failure_then_retry(self):
        self.post.side_effect = fake_provider(whisper=response(500, text="down"))
        failed = self.upload().json()
        self.assertEqual((failed["status"], failed["failed_stage"]), ("failed", "transcription"))
        self.assertIn("temporarily unavailable", failed["error_message"])

        self.post.side_effect = fake_provider()
        retried = self.client.post(f"{URL}{failed['id']}/retry/").json()

        self.assertEqual(retried["status"], "transcribed")
        self.assertEqual(retried["error_message"], "")

    def test_answer_failure_then_retry(self):
        question_id = self.upload().json()["id"]
        self.post.side_effect = fake_provider(gemini=response(429, text="quota"))
        failed = self.ask(question_id).json()
        self.assertEqual((failed["status"], failed["failed_stage"]), ("failed", "answer"))

        self.post.side_effect = fake_provider()
        retried = self.client.post(f"{URL}{question_id}/retry/").json()
        self.assertEqual(retried["status"], "answered")

    def test_cannot_retry_or_ask_at_wrong_time(self):
        question_id = self.upload().json()["id"]
        self.assertEqual(self.client.post(f"{URL}{question_id}/retry/").status_code, 400)
        VoiceQuestion.objects.filter(pk=question_id).update(status="answering")
        self.assertEqual(self.ask(question_id).status_code, 400)

    def test_empty_question_text_rejected(self):
        question_id = self.upload().json()["id"]
        self.assertEqual(self.ask(question_id, "   ").status_code, 400)

    def test_history_and_audio_are_private(self):
        question_id = self.upload().json()["id"]

        self.assertEqual(self.client.get(URL).json()["count"], 1)
        audio = self.client.get(f"{URL}{question_id}/audio/")
        self.assertEqual(audio.status_code, 200)
        self.assertEqual(audio["Content-Type"], "audio/webm")

        self.client.force_login(self.other)
        self.assertEqual(self.client.get(URL).json()["count"], 0)
        for method, path in [
            ("get", f"{URL}{question_id}/"),
            ("get", f"{URL}{question_id}/audio/"),
            ("post", f"{URL}{question_id}/ask/"),
            ("post", f"{URL}{question_id}/retry/"),
            ("delete", f"{URL}{question_id}/"),
        ]:
            with self.subTest(method=method, path=path):
                self.assertEqual(getattr(self.client, method)(path).status_code, 404)

        # Not even administrators can read a student's questions through the API.
        admin = User.objects.create_user(email="a@example.com", password="x", role="admin")
        self.client.force_login(admin)
        self.assertEqual(self.client.get(f"{URL}{question_id}/").status_code, 404)

    def test_filter_history_by_course(self):
        other_course = create_course(self.teacher, title="Other", filename="o.pdf")
        self.upload()
        self.upload(course=other_course.pk)

        self.assertEqual(self.client.get(f"{URL}?course={self.course.pk}").json()["count"], 1)
        self.assertEqual(self.client.get(f"{URL}?course=abc").status_code, 400)

    def test_delete_removes_record_and_audio(self):
        question = VoiceQuestion.objects.get(pk=self.upload().json()["id"])
        storage, name = question.audio.storage, question.audio.name

        self.assertEqual(self.client.delete(f"{URL}{question.pk}/").status_code, 204)

        self.assertFalse(VoiceQuestion.objects.exists())
        self.assertFalse(storage.exists(name))

    def test_cannot_delete_while_processing(self):
        question_id = self.upload().json()["id"]
        VoiceQuestion.objects.filter(pk=question_id).update(status="transcribing")
        self.assertEqual(self.client.delete(f"{URL}{question_id}/").status_code, 400)

    def test_worker_down(self):
        with mock.patch(
            "voice_qa.tasks.transcribe_question_task.apply_async",
            side_effect=OperationalError("refused"),
        ):
            result = self.upload()

        self.assertEqual(result.status_code, 503)
        self.assertIn("Celery", result.json()["error"]["message"])
        self.assertEqual(VoiceQuestion.objects.get().status, "failed")

    @override_settings(VOICE_QA_MAX_ACTIVE=1)
    def test_one_question_at_a_time(self):
        question_id = self.upload().json()["id"]
        VoiceQuestion.objects.filter(pk=question_id).update(status="transcribing", updated_at=timezone.now())

        self.assertEqual(self.upload().status_code, 429)

    def test_stale_processing_is_failed(self):
        question_id = self.upload().json()["id"]
        VoiceQuestion.objects.filter(pk=question_id).update(
            status="answering", updated_at=timezone.now() - timedelta(hours=1)
        )

        data = self.client.get(f"{URL}{question_id}/").json()

        self.assertEqual((data["status"], data["failed_stage"]), ("failed", "answer"))
        self.assertIn("worker", data["error_message"])

    def test_unexpected_errors_are_hidden(self):
        self.post.side_effect = RuntimeError("secret internal detail")
        data = self.upload().json()

        self.assertEqual(data["status"], "failed")
        self.assertNotIn("secret", data["error_message"])


# --- Free local Whisper ---------------------------------------------------------------


class FakeWhisperModel:
    def __init__(self, text=" Qu'est-ce que la descente de gradient ? ", language="fr"):
        self.text, self.language, self.calls = text, language, []

    def transcribe(self, samples, **options):
        self.calls.append((samples, options))
        return {"text": self.text, "language": self.language}


def pretend_whisper_is_installed(test):
    """The model is always a fake here, so the optional openai-whisper package
    (left out of requirements.txt for the Render deployment) is not needed."""
    patcher = mock.patch.object(local_whisper, "available", return_value=True)
    patcher.start()
    test.addCleanup(patcher.stop)


@override_settings(VOICE_QA_TRANSCRIPTION_PROVIDER="local", VOICE_QA_WHISPER_MODEL="base")
class LocalWhisperTests(SimpleTestCase):
    def setUp(self):
        pretend_whisper_is_installed(self)

    def test_is_the_free_default_and_needs_no_key(self):
        with override_settings(OPENAI_API_KEY=""):
            self.assertTrue(services.transcription_enabled())
        self.assertEqual(services.transcription_model_label(), "whisper-base (local)")

    def test_decodes_audio_with_bundled_ffmpeg(self):
        samples = local_whisper._decode(build_wav(seconds=1.0), ".wav")

        self.assertAlmostEqual(samples.size / 16000, 1.0, places=1)  # resampled to 16 kHz mono
        self.assertLessEqual(float(abs(samples).max()), 1.0)

    def test_transcribes_with_language_hint(self):
        model = FakeWhisperModel()
        with mock.patch.object(local_whisper, "_load_model", return_value=model):
            text, language = services.transcribe(
                io_bytes(build_wav(seconds=1.0)), "q.wav", "audio/wav", "fr"
            )

        self.assertEqual((text, language), ("Qu'est-ce que la descente de gradient ?", "fr"))
        options = model.calls[0][1]
        self.assertEqual((options["language"], options["fp16"]), ("fr", False))

    def test_automatic_language(self):
        model = FakeWhisperModel("ما هو معدل التعلم؟", "ar")
        with mock.patch.object(local_whisper, "_load_model", return_value=model):
            _, language = services.transcribe(io_bytes(build_wav(seconds=1.0)), "q.wav", "audio/wav")

        self.assertEqual(language, "ar")
        self.assertIsNone(model.calls[0][1]["language"])

    def test_rejects_unreadable_short_or_silent_audio(self):
        cases = [
            (b"definitely not audio", "could not be read"),
            (build_wav(seconds=0.1), "too short"),
        ]
        for data, expected in cases:
            with self.subTest(expected=expected):
                with self.assertRaisesMessage(services.ServiceError, expected):
                    services.transcribe(io_bytes(data), "q.wav", "audio/wav")

        with mock.patch.object(local_whisper, "_load_model", return_value=FakeWhisperModel("  ")):
            with self.assertRaisesMessage(services.ServiceError, "No speech"):
                services.transcribe(io_bytes(build_wav(seconds=1.0)), "q.wav", "audio/wav")

    def test_unavailable_engine(self):
        with mock.patch.object(local_whisper, "available", return_value=False):
            self.assertFalse(services.transcription_enabled())


def io_bytes(data):
    import io

    return io.BytesIO(data)


@override_settings(
    VOICE_QA_TRANSCRIPTION_PROVIDER="local",
    GEMINI_API_KEY="gm-test-gemini",
    OPENAI_API_KEY="",
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class LocalWhisperApiTests(TemporaryMediaMixin, APITestCase):
    def setUp(self):
        super().setUp()
        pretend_whisper_is_installed(self)
        previous = celery_app.conf.task_always_eager
        celery_app.conf.update(CELERY_TASK_ALWAYS_EAGER=True)
        self.addCleanup(celery_app.conf.update, CELERY_TASK_ALWAYS_EAGER=previous)
        teacher = User.objects.create_user(email="t@example.com", password="x", role="teacher")
        self.student = User.objects.create_user(email="s@example.com", password="x", role="student")
        self.course = create_course(teacher)
        self.client.force_login(self.student)

    def test_full_flow_without_openai(self):
        upload = SimpleUploadedFile("question.wav", build_wav(seconds=1.0), content_type="audio/wav")
        with mock.patch.object(local_whisper, "_load_model", return_value=FakeWhisperModel()):
            data = self.client.post(URL, {"course": self.course.pk, "audio": upload}, format="multipart").json()

        self.assertEqual(data["status"], "transcribed", data)
        self.assertEqual(data["question_text"], "Qu'est-ce que la descente de gradient ?")
        self.assertEqual(VoiceQuestion.objects.get().transcription_model, "whisper-base (local)")
        self.assertTrue(self.client.get(f"{URL}config/").json()["enabled"])
