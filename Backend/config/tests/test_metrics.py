from django.test import TestCase, override_settings
from django.urls import reverse

from accounts.models import User
from courses.models import Course


TOKEN = "test-metrics-token"


@override_settings(METRICS_TOKEN=TOKEN)
class MetricsViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.teacher_one = User.objects.create_user(
            email="teacher1@example.com",
            password="Password!2026",
            first_name="Tess",
            role=User.Role.TEACHER,
        )
        cls.teacher_two = User.objects.create_user(
            email="teacher2@example.com",
            password="Password!2026",
            first_name="Theo",
            role=User.Role.TEACHER,
        )
        for index, first_name in enumerate(("Sam", "Sara", "Sami"), start=1):
            User.objects.create_user(
                email=f"student{index}@example.com",
                password="Password!2026",
                first_name=first_name,
                role=User.Role.STUDENT,
            )
        User.objects.create_user(
            email="admin@example.com",
            password="Password!2026",
            first_name="Ada",
            role=User.Role.ADMIN,
        )
        for title in ("Python Basics", "Django Web"):
            Course.objects.create(
                owner=cls.teacher_one,
                title=title,
                type=Course.Type.PDF,
            )

    def _get(self, token=TOKEN):
        headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"} if token else {}
        return self.client.get(reverse("metrics"), **headers)

    def test_exposes_counts_by_role_and_total_courses(self):
        response = self._get()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response["Content-Type"],
            "text/plain; version=0.0.4; charset=utf-8",
        )
        self.assertEqual(response["Cache-Control"], "no-store")
        lines = response.content.decode().splitlines()
        self.assertIn("# TYPE edumind_users gauge", lines)
        self.assertIn('edumind_users{role="teacher"} 2', lines)
        self.assertIn('edumind_users{role="student"} 3', lines)
        self.assertIn("# TYPE edumind_courses gauge", lines)
        self.assertIn("edumind_courses 2", lines)

    def test_admins_are_not_counted_as_teachers_or_students(self):
        body = self._get().content.decode()

        self.assertNotIn('edumind_users{role="admin"}', body)

    def test_missing_token_is_rejected(self):
        response = self._get(token=None)

        self.assertEqual(response.status_code, 401)
        self.assertEqual(
            response["WWW-Authenticate"], 'Bearer realm="edumind-metrics"'
        )

    def test_wrong_token_is_rejected(self):
        response = self._get(token="wrong-token")

        self.assertEqual(response.status_code, 401)

    def test_non_bearer_scheme_is_rejected(self):
        response = self.client.get(
            reverse("metrics"),
            HTTP_AUTHORIZATION=f"Basic {TOKEN}",
        )

        self.assertEqual(response.status_code, 401)

    def test_endpoint_is_disabled_without_configured_token(self):
        with override_settings(METRICS_TOKEN=""):
            response = self._get(token=None)

        self.assertEqual(response.status_code, 404)

    def test_only_get_is_allowed(self):
        response = self.client.post(
            reverse("metrics"),
            HTTP_AUTHORIZATION=f"Bearer {TOKEN}",
        )

        self.assertEqual(response.status_code, 405)
