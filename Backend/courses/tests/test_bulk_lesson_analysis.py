import tempfile
from pathlib import Path
from unittest import mock

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from courses.content_analyzer import (
    estimate_lesson_duration,
    order_lessons,
)
from courses.demo_files import build_pdf
from courses.tests.utils import (
    pdf_upload,
    wav_upload,
)

BULK_URL = "/api/courses/analyze-bulk-lessons/"

BEGINNER_TEXT = (
    "This introduction covers the basics of getting started. "
    "It is a simple overview for first-time learners."
)


def bulk_pdf(name, title, description=BEGINNER_TEXT):
    return pdf_upload(
        name=name,
        title=title,
        content=build_pdf(title, description),
    )


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class BulkLessonAnalysisApiTests(APITestCase):
    password = "StrongPass123!"

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.teacher = User.objects.create_user(
            email="teacher@example.com",
            password=self.password,
            first_name="Thomas",
            last_name="Teacher",
            role=User.Role.TEACHER,
        )
        self.other_teacher = User.objects.create_user(
            email="other@example.com",
            password=self.password,
            first_name="Olivia",
            last_name="Other",
            role=User.Role.TEACHER,
        )
        self.student = User.objects.create_user(
            email="student@example.com",
            password=self.password,
            first_name="Sam",
            last_name="Student",
            role=User.Role.STUDENT,
        )
        self.client.force_login(self.teacher)

    def post_files(self, files):
        return self.client.post(BULK_URL, {"files": files}, format="multipart")

    def test_single_file_returns_one_lesson(self):
        response = self.post_files(
            [bulk_pdf("intro.pdf", "Introduction to Python")]
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["total_files"], 1)
        self.assertEqual(data["successful"], 1)
        self.assertEqual(data["failed"], [])
        self.assertGreaterEqual(data["processing_time_ms"], 0)

        lesson = data["lessons"][0]
        self.assertEqual(lesson["order"], 1)
        self.assertEqual(lesson["title"], "Introduction to Python")
        self.assertEqual(lesson["file_name"], "intro.pdf")
        self.assertEqual(lesson["file_type"], "pdf")
        self.assertIn(lesson["difficulty"], {"beginner", "intermediate", "advanced"})
        self.assertEqual(lesson["duration_minutes"], 1)
        self.assertGreaterEqual(lesson["confidence"], 0)
        self.assertLessEqual(lesson["confidence"], 1)
        self.assertGreaterEqual(len(lesson["description"]), 50)

    def test_three_files_return_three_ordered_lessons(self):
        response = self.post_files(
            [
                bulk_pdf("02_variables.pdf", "Variables and data types"),
                bulk_pdf("01_intro.pdf", "Introduction to Python"),
                bulk_pdf("03_functions.pdf", "Functions and methods"),
            ]
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["successful"], 3)
        self.assertEqual(
            [lesson["order"] for lesson in data["lessons"]], [1, 2, 3]
        )
        self.assertEqual(
            [lesson["file_name"] for lesson in data["lessons"]],
            ["01_intro.pdf", "02_variables.pdf", "03_functions.pdf"],
        )

    def test_ten_files_are_accepted(self):
        files = [bulk_pdf(f"lesson_{index}.pdf", f"Lesson {index}") for index in range(10)]

        response = self.post_files(files)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["total_files"], 10)
        self.assertEqual(data["successful"], 10)

    def test_more_than_ten_files_are_rejected(self):
        files = [bulk_pdf(f"lesson_{index}.pdf", f"Lesson {index}") for index in range(11)]

        response = self.post_files(files)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("files", response.json()["error"]["fields"])

    def test_no_files_are_rejected(self):
        response = self.client.post(BULK_URL, {}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("files", response.json()["error"]["fields"])

    def test_unsupported_file_types_are_rejected(self):
        upload = SimpleUploadedFile(
            "notes.txt", b"plain text", content_type="text/plain"
        )

        response = self.post_files([upload])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("files", response.json()["error"]["fields"])

    @override_settings(CONTENT_ANALYZER_WHISPER_MODEL="tiny")
    def test_mixed_file_types_are_analysed(self):
        speech = (
            "Welcome to this introduction to variables. We cover simple "
            "examples for beginners and practice the basics."
        )
        with mock.patch(
            "courses.content_analyzer.transcribe_audio", return_value=speech
        ):
            response = self.post_files(
                [
                    bulk_pdf("01_intro.pdf", "Introduction"),
                    wav_upload(name="02_variables.wav"),
                ]
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["successful"], 2)

        by_name = {lesson["file_name"]: lesson for lesson in data["lessons"]}
        self.assertEqual(by_name["01_intro.pdf"]["file_type"], "pdf")
        self.assertEqual(by_name["02_variables.wav"]["file_type"], "audio")
        self.assertEqual(by_name["02_variables.wav"]["duration_minutes"], 1)

    def test_lessons_are_sorted_by_difficulty_then_name(self):
        response = self.post_files(
            [
                bulk_pdf("zulu.pdf", "Zulu"),
                bulk_pdf("alpha.pdf", "Alpha"),
                bulk_pdf("01_first.pdf", "First"),
            ]
        )

        lessons = response.json()["lessons"]
        ranks = {"beginner": 0, "intermediate": 1, "advanced": 2}
        observed = [ranks[lesson["difficulty"]] for lesson in lessons]
        self.assertEqual(observed, sorted(observed))
        # A single difficulty group keeps the numbered file first.
        self.assertEqual(
            [lesson["file_name"] for lesson in lessons],
            ["01_first.pdf", "alpha.pdf", "zulu.pdf"],
        )

    def test_partial_failure_keeps_successful_lessons(self):
        broken = SimpleUploadedFile(
            "broken.pdf", b"%PDF-1.4\nnot really a pdf", content_type="application/pdf"
        )

        response = self.post_files(
            [
                bulk_pdf("intro.pdf", "Introduction"),
                broken,
                bulk_pdf("variables.pdf", "Variables"),
            ]
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["total_files"], 3)
        self.assertEqual(data["successful"], 2)
        self.assertEqual(len(data["failed"]), 1)
        self.assertEqual(data["failed"][0]["file_name"], "broken.pdf")
        self.assertTrue(data["failed"][0]["error"])
        self.assertEqual(
            sorted(lesson["file_name"] for lesson in data["lessons"]),
            ["intro.pdf", "variables.pdf"],
        )

    def test_all_failures_return_an_empty_lesson_list(self):
        broken = SimpleUploadedFile(
            "broken.pdf", b"%PDF-1.4\nnot really a pdf", content_type="application/pdf"
        )

        response = self.post_files([broken])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["lessons"], [])
        self.assertEqual(data["successful"], 0)
        self.assertEqual(len(data["failed"]), 1)

    @override_settings(CONTENT_ANALYZER_WHISPER_MODEL="tiny")
    def test_media_without_speech_falls_back_to_the_file_name(self):
        with mock.patch(
            "courses.content_analyzer.transcribe_audio", return_value=""
        ):
            response = self.post_files([wav_upload(name="02_variables.wav")])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        lesson = response.json()["lessons"][0]
        self.assertEqual(lesson["title"], "Variables")
        self.assertTrue(lesson["warnings"])

    def test_eleventh_request_is_throttled(self):
        for _ in range(10):
            response = self.post_files(
                [bulk_pdf("intro.pdf", "Introduction to Programming")]
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.post_files(
            [bulk_pdf("intro.pdf", "Introduction to Programming")]
        )

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.json()["error"]["code"], "throttled")

    @override_settings(BULK_LESSON_ANALYSIS_HOURLY_LIMIT=1)
    def test_throttle_is_per_teacher(self):
        self.assertEqual(
            self.post_files(
                [bulk_pdf("intro.pdf", "Introduction to Programming")]
            ).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.post_files(
                [bulk_pdf("intro.pdf", "Introduction to Programming")]
            ).status_code,
            status.HTTP_429_TOO_MANY_REQUESTS,
        )

        self.client.force_login(self.other_teacher)
        self.assertEqual(
            self.post_files(
                [bulk_pdf("intro.pdf", "Introduction to Programming")]
            ).status_code,
            status.HTTP_200_OK,
        )

    def test_students_cannot_analyze_bulk_lessons(self):
        self.client.force_login(self.student)

        response = self.post_files([bulk_pdf("intro.pdf", "Introduction")])

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_users_are_rejected(self):
        self.client.logout()

        response = self.post_files([bulk_pdf("intro.pdf", "Introduction")])

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class LessonDurationTests(APITestCase):
    def test_pdf_duration_uses_reading_speed(self):
        path = Path(tempfile.gettempdir()) / "unused.pdf"

        self.assertEqual(estimate_lesson_duration(path, "pdf", 100), 1)
        self.assertEqual(estimate_lesson_duration(path, "pdf", 401), 2)
        self.assertEqual(estimate_lesson_duration(path, "pdf", 600), 3)

    def test_media_duration_uses_the_real_length(self):
        path = Path(tempfile.mkdtemp(prefix="edumind-duration-")) / "audio.wav"
        path.write_bytes(wav_upload(name="audio.wav").read())

        self.assertEqual(estimate_lesson_duration(path, "wav"), 1)

    def test_unknown_duration_returns_none(self):
        path = Path(tempfile.gettempdir()) / "missing.mp3"

        self.assertIsNone(estimate_lesson_duration(path, "mp3"))
        self.assertIsNone(estimate_lesson_duration(path, "pdf", 0))


class OrderLessonsTests(APITestCase):
    @staticmethod
    def lesson(name, difficulty):
        return {
            "title": name,
            "description": "",
            "duration_minutes": 1,
            "file_name": name,
            "file_type": "pdf",
            "difficulty": difficulty,
            "confidence": 0.8,
            "warnings": [],
        }

    def test_orders_by_difficulty_then_numeric_prefix(self):
        lessons = [
            self.lesson("functions.pdf", "advanced"),
            self.lesson("variables.pdf", "intermediate"),
            self.lesson("02_loops.pdf", "beginner"),
            self.lesson("01_intro.pdf", "beginner"),
            self.lesson("appendix.pdf", "beginner"),
        ]

        ordered = order_lessons(lessons)

        self.assertEqual(
            [lesson["file_name"] for lesson in ordered],
            [
                "01_intro.pdf",
                "02_loops.pdf",
                "appendix.pdf",
                "variables.pdf",
                "functions.pdf",
            ],
        )
        self.assertEqual([lesson["order"] for lesson in ordered], [1, 2, 3, 4, 5])

    def test_equal_scores_fall_back_to_upload_order(self):
        lessons = [
            self.lesson("b.pdf", "beginner"),
            self.lesson("b.pdf", "beginner"),
        ]

        ordered = order_lessons(lessons)

        self.assertEqual([lesson["order"] for lesson in ordered], [1, 2])
        self.assertEqual(len(ordered), 2)
