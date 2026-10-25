from datetime import timedelta

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from courses.models import Course

from .utils import (
    M4A_BYTES,
    MP3_BYTES,
    OGG_BYTES,
    TemporaryMediaMixin,
    create_course,
    pdf_upload,
    stored_bytes,
)


class CourseModelTests(TemporaryMediaMixin, TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            email="teacher@example.com",
            password="StrongPass123!",
            role=User.Role.TEACHER,
        )

    def test_pdf_type_is_derived_from_file(self):
        course = create_course(self.teacher, filename="cours.pdf")

        self.assertEqual(course.type, Course.Type.PDF)
        self.assertTrue(course.file.name.startswith("courses/"))
        self.assertTrue(course.file.name.endswith(".pdf"))
        self.assertNotIn("cours.pdf", course.file.name)
        self.assertTrue(course.file.storage.exists(course.file.name))

    def test_audio_types_are_derived_from_file(self):
        cases = (
            ("audio.wav", None),
            ("audio.mp3", MP3_BYTES),
            ("audio.m4a", M4A_BYTES),
            ("audio.ogg", OGG_BYTES),
        )
        for filename, content in cases:
            with self.subTest(filename=filename):
                course = create_course(
                    self.teacher,
                    title=f"Cours {filename}",
                    filename=filename,
                    content=content,
                )
                self.assertEqual(course.type, Course.Type.AUDIO)

    def test_courses_are_ordered_newest_first(self):
        old = create_course(self.teacher, title="Ancien")
        new = create_course(self.teacher, title="Récent")
        Course.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(days=1)
        )

        self.assertEqual(
            list(Course.objects.values_list("id", flat=True)),
            [new.pk, old.pk],
        )

    def test_str_returns_title(self):
        course = create_course(self.teacher, title="Algorithmes")

        self.assertEqual(str(course), "Algorithmes")

    def test_deleting_course_removes_its_file(self):
        course = create_course(self.teacher)
        storage = course.file.storage
        file_name = course.file.name
        self.assertTrue(storage.exists(file_name))

        course.delete()

        self.assertFalse(storage.exists(file_name))

    def test_full_clean_rejects_unsupported_extension(self):
        course = Course(
            title="Invalide",
            owner=self.teacher,
            file=pdf_upload(name="notes.txt", content_type="text/plain"),
        )

        with self.assertRaises(ValidationError):
            course.full_clean()

    def test_stored_content_round_trip(self):
        course = create_course(self.teacher, filename="audio.wav")

        self.assertTrue(stored_bytes(course).startswith(b"RIFF"))
