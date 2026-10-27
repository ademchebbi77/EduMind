from io import BytesIO, StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from PIL import Image

from accounts.models import User
from assessments.generation.extraction import extract_course
from courses.demo_catalog import DEMO_CATALOG, DEMO_CATEGORIES, DEMO_ENROLLMENTS
from courses.models import Category, Course, Enrollment, LessonCompletion

from .utils import TemporaryMediaMixin


class SeedCoursesCommandTests(TemporaryMediaMixin, TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            email="teacher@edumind.local", password="x", role=User.Role.TEACHER
        )
        self.student = User.objects.create_user(
            email="student@edumind.local", password="x", role=User.Role.STUDENT
        )

    def run_command(self, *args):
        call_command("seed_courses", *args, stdout=StringIO())

    def test_creates_the_catalogue_idempotently(self):
        self.run_command()
        self.run_command()

        self.assertEqual(Category.objects.count(), len(DEMO_CATEGORIES))
        self.assertEqual(Course.objects.count(), len(DEMO_CATALOG))
        for spec in DEMO_CATALOG:
            course = Course.objects.get(title=spec["title"])
            self.assertEqual(course.owner, self.teacher)
            self.assertEqual(course.category.name, spec["category"])
            self.assertEqual(course.difficulty, spec["difficulty"])
            self.assertEqual(course.type, Course.Type.PDF)
            self.assertEqual(course.lessons.count(), len(spec["lessons"]))
            self.assertTrue(course.thumbnail)

    def test_course_pdf_text_is_readable_with_accents(self):
        self.run_command()

        course = Course.objects.get(title="Introduction à la cybersécurité")
        text = extract_course(course)

        self.assertIn("confidentialité", text)
        self.assertIn("injection SQL", text)
        self.assertGreater(len(text.split()), 200)

    def test_thumbnail_is_a_valid_png(self):
        self.run_command()

        course = Course.objects.get(title="Docker et déploiement d'applications")
        with course.thumbnail.open("rb") as handle:
            image = Image.open(BytesIO(handle.read()))
            self.assertEqual(image.format, "PNG")
            self.assertEqual(image.size, (1280, 720))

    def test_enrolls_the_demo_student_with_progress(self):
        self.run_command()
        self.run_command()

        self.assertEqual(
            Enrollment.objects.filter(student=self.student).count(), len(DEMO_ENROLLMENTS)
        )
        react = Course.objects.get(title="Développement web avec React")
        self.assertEqual(react.enrolled_count, 1)
        self.assertEqual(
            LessonCompletion.objects.filter(
                student=self.student, lesson__course=react, completed=True
            ).count(),
            DEMO_ENROLLMENTS["Développement web avec React"],
        )

    def test_owner_option_and_missing_teacher(self):
        other = User.objects.create_user(
            email="prof@example.com", password="x", role=User.Role.TEACHER
        )
        self.run_command("--owner", "prof@example.com")
        self.assertFalse(Course.objects.exclude(owner=other).exists())

        with self.assertRaises(CommandError):
            self.run_command("--owner", "nobody@example.com")

    def test_falls_back_to_another_teacher(self):
        self.teacher.delete()
        other = User.objects.create_user(
            email="prof@example.com", password="x", role=User.Role.TEACHER
        )

        self.run_command()

        self.assertEqual(Course.objects.first().owner, other)
