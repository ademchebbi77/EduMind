from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from accounts.management.commands.seed_demo import DEMO_COURSES, DEMO_PASSWORD
from accounts.models import User
from courses.models import Course
from courses.tests.utils import TemporaryMediaMixin


class SeedDemoCommandTests(TemporaryMediaMixin, TestCase):
    @override_settings(DEBUG=True)
    def test_seed_demo_creates_users_idempotently(self):
        output = StringIO()

        call_command("seed_demo", stdout=output)
        call_command("seed_demo", stdout=output)

        self.assertEqual(User.objects.count(), 3)
        admin = User.objects.get(email="admin@edumind.local")
        teacher = User.objects.get(email="teacher@edumind.local")
        student = User.objects.get(email="student@edumind.local")

        self.assertEqual(admin.role, User.Role.ADMIN)
        self.assertTrue(admin.is_superuser)
        self.assertTrue(admin.is_staff)
        self.assertEqual(teacher.role, User.Role.TEACHER)
        self.assertEqual(student.role, User.Role.STUDENT)
        self.assertTrue(admin.check_password(DEMO_PASSWORD))
        self.assertIn(DEMO_PASSWORD, output.getvalue())

    @override_settings(DEBUG=True)
    def test_seed_demo_creates_courses_with_files_once(self):
        output = StringIO()

        call_command("seed_demo", stdout=output)
        call_command("seed_demo", stdout=output)

        self.assertEqual(Course.objects.count(), len(DEMO_COURSES))
        self.assertEqual(Course.objects.filter(type=Course.Type.PDF).count(), 2)
        self.assertEqual(Course.objects.filter(type=Course.Type.AUDIO).count(), 2)

        teacher = User.objects.get(email="teacher@edumind.local")
        for course in Course.objects.all():
            self.assertEqual(course.owner, teacher)
            self.assertTrue(course.file.storage.exists(course.file.name))

        self.assertIn("demo courses", output.getvalue())

    @override_settings(DEBUG=False)
    def test_seed_demo_refuses_when_debug_is_disabled(self):
        with self.assertRaises(CommandError):
            call_command("seed_demo", stdout=StringIO())

        self.assertFalse(User.objects.exists())
        self.assertFalse(Course.objects.exists())
