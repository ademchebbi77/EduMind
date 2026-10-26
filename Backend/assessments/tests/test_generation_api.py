import io
import tempfile
from datetime import timedelta
from pathlib import Path
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from kombu.exceptions import OperationalError
from rest_framework.test import APITestCase

from accounts.models import User
from assessments.generation.service import record_feedback, run_job
from assessments.models import QuizGenerationJob
from config.celery import app as celery_app
from courses.models import Course, CourseTranscript
from courses.tests.utils import TemporaryMediaMixin

from .test_generation_engine import ENGLISH, FRENCH, docx_bytes, text_pdf
from .utils import create_course, create_quiz, make_user

JOBS_URL = "/api/quiz-generator/jobs/"


def job_url(job_id):
    return f"{JOBS_URL}{job_id}/"


def text_upload(content=FRENCH, name="cours.txt"):
    return SimpleUploadedFile(name, content.encode("utf-8"), content_type="text/plain")


class EagerCeleryMixin:
    """Run Celery tasks inline, as a worker would, without Redis."""

    def setUp(self):
        super().setUp()
        # The app uses the "CELERY" settings namespace, so overrides need the prefix.
        previous = celery_app.conf.task_always_eager
        celery_app.conf.update(CELERY_TASK_ALWAYS_EAGER=True)
        self.addCleanup(celery_app.conf.update, CELERY_TASK_ALWAYS_EAGER=previous)


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class GenerationApiTests(EagerCeleryMixin, TemporaryMediaMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)
        self.other_teacher = make_user("other@example.com", User.Role.TEACHER)
        self.admin = make_user("admin@example.com", User.Role.ADMIN)
        self.student = make_user("student@example.com", User.Role.STUDENT)
        self.pdf_course = create_course(
            self.teacher,
            title="Neural networks",
            filename="nn.pdf",
            content=text_pdf(sentence for sentence in ENGLISH.splitlines() if sentence.strip()),
        )
        self.client.force_login(self.teacher)

    def create(self, **data):
        if "file" in data:
            data.setdefault("course", self.pdf_course.pk)  # course the quiz belongs to
        return self.client.post(JOBS_URL, data, format="multipart")

    def test_generate_from_uploaded_text(self):
        response = self.create(file=text_upload(), num_questions=8)

        self.assertEqual(response.status_code, 202, response.json())
        data = response.json()
        self.assertEqual(data["status"], "completed")
        self.assertEqual(data["stage"], "done")
        self.assertEqual(data["language"], "fr")
        self.assertEqual(data["engine"], "pure-python")
        self.assertEqual(data["source_name"], "cours.txt")
        self.assertEqual(len(data["result"]["questions"]), 8)
        self.assertEqual(data["result"]["title"], "Quiz : cours")
        self.assertEqual(data["stats"]["grounded"], 8)
        self.assertIsNotNone(data["processing_ms"])
        job = QuizGenerationJob.objects.get(pk=data["id"])
        self.assertFalse(job.source_file)  # uploaded document deleted after use

    def test_uploaded_document_is_attached_to_the_chosen_course(self):
        audio = create_course(self.teacher, title="Podcast", filename="podcast.wav")

        # The course has no text of its own: that is fine, the upload is the source.
        response = self.create(file=text_upload(name="chapitre-3_test.txt"), course=audio.pk)

        data = response.json()
        self.assertEqual(data["status"], "completed", data)
        self.assertEqual(data["course"], audio.pk)
        self.assertEqual(data["source_name"], "chapitre-3_test.txt")
        self.assertEqual(data["language"], "fr")
        self.assertEqual(data["result"]["title"], "Quiz : chapitre 3 test")

    def pdf_upload(self, name="Chapitre_2 - Neural networks.pdf"):
        lines = [line for line in ENGLISH.splitlines() if line.strip()]
        return SimpleUploadedFile(name, text_pdf(lines), content_type="application/pdf")

    def test_uploaded_pdf_can_become_a_new_course(self):
        response = self.create(file=self.pdf_upload(), create_course="true")

        data = response.json()
        self.assertEqual(data["status"], "completed", data)
        course = Course.objects.get(pk=data["course"])
        self.assertEqual(course.title, "Chapitre 2 Neural networks")
        self.assertEqual((course.owner, course.type), (self.teacher, "pdf"))
        self.assertTrue(course.file.storage.exists(course.file.name))
        self.assertEqual(data["source_name"], "Chapitre 2 Neural networks")
        self.assertEqual(data["result"]["title"], "Quiz: Chapitre 2 Neural networks")
        self.assertFalse(QuizGenerationJob.objects.get(pk=data["id"]).source_file)

    def test_only_pdf_documents_become_courses(self):
        response = self.create(file=text_upload(), create_course="true")

        self.assertEqual(response.status_code, 400)
        self.assertIn("create_course", response.json()["error"]["fields"])
        self.assertEqual(Course.objects.count(), 1)

    def test_new_course_is_removed_when_the_worker_is_down(self):
        with mock.patch(
            "assessments.tasks.generate_quiz_task.apply_async",
            side_effect=OperationalError("connection refused"),
        ):
            response = self.create(file=self.pdf_upload(), create_course="true")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(Course.objects.count(), 1)  # only the course from setUp

    def test_generate_from_pdf_course(self):
        response = self.create(course=self.pdf_course.pk, num_questions=5, difficulty="beginner")

        self.assertEqual(response.json()["status"], "completed", response.json())
        self.assertEqual(response.json()["language"], "en")
        self.assertEqual(response.json()["course_title"], "Neural networks")

    def test_generate_from_docx_and_type_filter(self):
        upload = SimpleUploadedFile("notes.docx", docx_bytes(ENGLISH.splitlines()))
        response = self.create(file=upload, num_questions=5, question_types=["true_false"])

        questions = response.json()["result"]["questions"]
        self.assertEqual({question["type"] for question in questions}, {"true_false"})

    def test_audio_course_needs_a_transcript(self):
        audio = create_course(self.teacher, title="Podcast", filename="podcast.wav")

        response = self.create(course=audio.pk)
        self.assertEqual(response.status_code, 400)
        self.assertIn("transcript", response.json()["error"]["fields"]["course"][0])

        CourseTranscript.objects.create(course=audio, status="completed", text=f"[00:00] {ENGLISH}")
        response = self.create(course=audio.pk)
        self.assertEqual(response.json()["status"], "completed", response.json())

    def test_permissions(self):
        foreign = create_course(self.other_teacher, title="Foreign", filename="f.pdf")
        response = self.create(course=foreign.pk)
        self.assertEqual(response.status_code, 400)
        self.assertIn("own", response.json()["error"]["fields"]["course"][0])

        self.client.force_login(self.student)
        self.assertEqual(self.create(file=text_upload()).status_code, 403)
        self.assertEqual(self.client.get("/api/quiz-generator/sources/").status_code, 403)

        self.client.logout()
        self.assertEqual(self.create(file=text_upload()).status_code, 401)

    def test_request_validation(self):
        cases = [
            ({}, "course"),
            ({"file": text_upload(), "course": ""}, "course"),
            ({"file": text_upload(name="virus.exe")}, "file"),
            ({"file": SimpleUploadedFile("fake.pdf", b"not a pdf at all")}, "file"),
            ({"file": SimpleUploadedFile("bin.txt", b"\x00\x01\x02binary")}, "file"),
            ({"file": SimpleUploadedFile("empty.txt", b"")}, "file"),
            ({"file": text_upload(), "num_questions": 50}, "num_questions"),
            ({"file": text_upload(), "difficulty": "expert"}, "difficulty"),
            ({"file": text_upload(), "question_types": ["essay"]}, "question_types"),
        ]
        for data, field in cases:
            with self.subTest(field=field, data=list(data)):
                response = self.create(**data)
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json()["error"]["fields"])
        self.assertFalse(QuizGenerationJob.objects.exists())

    @override_settings(MAX_UPLOAD_SIZE_BYTES=10, MAX_UPLOAD_SIZE_MB=0)
    def test_oversized_file(self):
        self.assertEqual(self.create(file=text_upload()).status_code, 400)

    def test_too_little_text_fails_the_job_with_a_clear_message(self):
        response = self.create(file=text_upload("Short note. Nothing else.", name="short.txt"))

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json()["status"], "failed")
        self.assertIn("enough text", response.json()["error_message"])

    def test_unreadable_pdf_fails_the_job(self):
        response = self.create(file=SimpleUploadedFile("scan.pdf", text_pdf([])))

        self.assertEqual(response.json()["status"], "failed")
        self.assertIn("scanned", response.json()["error_message"])

    def test_broker_down_returns_503_and_cleans_up(self):
        with mock.patch(
            "assessments.tasks.generate_quiz_task.apply_async",
            side_effect=OperationalError("connection refused"),
        ):
            response = self.create(file=text_upload())

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "generator_unavailable")
        job = QuizGenerationJob.objects.get()
        self.assertEqual(job.status, "failed")
        self.assertFalse(job.source_file)

    @override_settings(QUIZ_GENERATION_MAX_ACTIVE_JOBS=2)
    def test_limits_concurrent_jobs(self):
        for _ in range(2):
            QuizGenerationJob.objects.create(requested_by=self.teacher, source_name="busy")

        response = self.create(file=text_upload())

        self.assertEqual(response.status_code, 429)

    def test_stale_jobs_are_failed(self):
        job = QuizGenerationJob.objects.create(requested_by=self.teacher, source_name="old")
        QuizGenerationJob.objects.filter(pk=job.pk).update(
            created_at=timezone.now() - timedelta(hours=1)
        )

        data = self.client.get(job_url(job.pk)).json()

        self.assertEqual(data["status"], "failed")
        self.assertIn("worker", data["error_message"])

    def test_jobs_are_private(self):
        job_id = self.create(file=text_upload()).json()["id"]

        self.client.force_login(self.other_teacher)
        self.assertEqual(self.client.get(job_url(job_id)).status_code, 404)
        self.assertEqual(self.client.get(JOBS_URL).json()["count"], 0)

        self.client.force_login(self.admin)
        self.assertEqual(self.client.get(job_url(job_id)).status_code, 200)

    def test_sources_list_availability(self):
        create_course(self.teacher, title="Podcast", filename="podcast.wav")
        create_course(self.other_teacher, title="Not mine", filename="x.pdf")

        results = self.client.get("/api/quiz-generator/sources/").json()["results"]

        by_title = {item["title"]: item for item in results}
        self.assertEqual(set(by_title), {"Neural networks", "Podcast"})
        self.assertTrue(by_title["Neural networks"]["available"])
        self.assertFalse(by_title["Podcast"]["available"])
        self.assertIn("transcript", by_title["Podcast"]["reason"])

    def test_saving_a_quiz_records_teacher_feedback(self):
        job = self.create(file=text_upload(), num_questions=6).json()
        questions = job["result"]["questions"]
        kept = [dict(question) for question in questions[:3]]
        edited = dict(questions[3], text=questions[3]["text"] + " (revised)")
        manual = {
            "text": "A brand new question?",
            "type": "single_choice",
            "points": 1,
            "options": [{"text": "Yes", "is_correct": True}, {"text": "No", "is_correct": False}],
        }
        payload = {
            "course": self.pdf_course.pk,
            "title": job["result"]["title"],
            "difficulty": "beginner",
            "passing_score": 50,
            "questions": kept + [edited, manual],
            "generation_job": job["id"],
        }

        response = self.client.post("/api/quizzes/", payload, format="json")

        self.assertEqual(response.status_code, 201, response.json())
        record = QuizGenerationJob.objects.get(pk=job["id"])
        self.assertEqual(record.quiz_id, response.json()["id"])
        self.assertEqual(
            {key: record.feedback[key] for key in ("generated", "kept", "edited", "removed", "added")},
            {"generated": 6, "kept": 3, "edited": 1, "removed": 2, "added": 1},
        )
        self.assertAlmostEqual(record.feedback["acceptance_rate"], 4 / 6, places=3)

        # A job links to one quiz only, and only for its owner.
        again = self.client.post("/api/quizzes/", payload, format="json")
        self.assertEqual(again.status_code, 400)
        self.assertIn("generation_job", again.json()["error"]["fields"])

    def test_cannot_link_someone_elses_job(self):
        job = QuizGenerationJob.objects.create(
            requested_by=self.other_teacher, source_name="x", status="completed", result={}
        )
        payload = {
            "course": self.pdf_course.pk,
            "title": "Quiz",
            "passing_score": 50,
            "questions": [
                {
                    "text": "Q?",
                    "type": "true_false",
                    "points": 1,
                    "options": [{"text": "True", "is_correct": True}, {"text": "False", "is_correct": False}],
                }
            ],
            "generation_job": str(job.pk),
        }

        response = self.client.post("/api/quizzes/", payload, format="json")

        self.assertEqual(response.status_code, 400)

    def test_metrics(self):
        self.create(file=text_upload(), num_questions=5)
        self.create(file=text_upload("Short. Text.", name="short.txt"))

        data = self.client.get("/api/quiz-generator/metrics/").json()

        self.assertEqual((data["jobs"], data["completed"], data["failed"]), (2, 1, 1))
        self.assertEqual(data["success_rate"], 0.5)
        self.assertEqual(data["questions"]["valid_rate"], 1.0)
        self.assertEqual(data["questions"]["grounded_rate"], 1.0)
        self.assertIsNotNone(data["processing_ms"]["median"])
        self.assertEqual(data["engine"], {"fr": "pure-python", "en": "pure-python"})
        self.assertEqual(data["languages"], {"fr": 1})


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class RunJobTests(TemporaryMediaMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)

    def make_job(self, **fields):
        job = QuizGenerationJob(requested_by=self.teacher, source_name="notes.txt", **fields)
        job.source_file.save("notes.txt", io.BytesIO(ENGLISH.encode()), save=False)
        job.save()
        return job

    def test_unexpected_errors_are_stored_without_details(self):
        job = self.make_job()
        with mock.patch(
            "assessments.generation.service.generate_quiz", side_effect=RuntimeError("boom")
        ):
            run_job(job.pk)

        job.refresh_from_db()
        self.assertEqual(job.status, "failed")
        self.assertNotIn("boom", job.error_message)
        self.assertFalse(job.source_file)

    def test_only_queued_jobs_run(self):
        job = self.make_job(status="completed")

        run_job(job.pk)

        job.refresh_from_db()
        self.assertIsNone(job.result)
        self.assertIsNone(run_job("00000000-0000-0000-0000-000000000000"))

    def test_feedback_with_no_generated_questions(self):
        job = self.make_job(status="completed", result={"questions": []})
        quiz = create_quiz(create_course(self.teacher))

        feedback = record_feedback(job, quiz)

        self.assertIsNone(feedback["acceptance_rate"])
        self.assertEqual(feedback["added"], 1)


class EvaluationCommandTests(TemporaryMediaMixin, APITestCase):
    def test_writes_a_report(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "report.md"
            extra = Path(directory) / "extra.txt"
            extra.write_text(ENGLISH, encoding="utf-8")

            call_command(
                "evaluate_quiz_generator",
                "--runs", "1", "--no-courses", "--file", str(extra), "--output", str(output),
                stdout=io.StringIO(),
            )

            report = output.read_text(encoding="utf-8")
        self.assertIn("apprentissage-automatique.txt", report)
        self.assertIn("file: extra.txt", report)
        self.assertIn("Grounded rate", report)
