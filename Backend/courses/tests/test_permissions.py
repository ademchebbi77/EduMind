from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from courses.models import Course

from .utils import (
    TemporaryMediaMixin,
    create_course,
    pdf_upload,
)

LIST_URL = "/api/courses/"


def detail_url(course):
    return f"/api/courses/{course.pk}/"


def file_url(course):
    return f"/api/courses/{course.pk}/file/"


def download_url(course):
    return f"/api/courses/{course.pk}/download/"


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class CoursePermissionTests(TemporaryMediaMixin, APITestCase):
    password = "StrongPass123!"

    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin@example.com",
            password=self.password,
            role=User.Role.ADMIN,
        )
        self.teacher = User.objects.create_user(
            email="teacher@example.com",
            password=self.password,
            role=User.Role.TEACHER,
        )
        self.other_teacher = User.objects.create_user(
            email="other@example.com",
            password=self.password,
            role=User.Role.TEACHER,
        )
        self.student = User.objects.create_user(
            email="student@example.com",
            password=self.password,
            role=User.Role.STUDENT,
        )
        self.course = create_course(self.teacher, title="Cours du professeur")
        self.other_course = create_course(self.other_teacher, title="Cours voisin")

    def test_anonymous_gets_401_everywhere(self):
        self.assertEqual(self.client.get(LIST_URL).status_code, 401)
        self.assertEqual(self.client.get(detail_url(self.course)).status_code, 401)
        self.assertEqual(self.client.get(file_url(self.course)).status_code, 401)
        self.assertEqual(self.client.get(download_url(self.course)).status_code, 401)

        create_response = self.client.post(
            LIST_URL,
            {"title": "Nouveau", "file": pdf_upload()},
            format="multipart",
        )
        self.assertEqual(create_response.status_code, 401)
        self.assertEqual(
            create_response.json()["error"]["code"],
            "authentication_required",
        )
        self.assertEqual(
            self.client.delete(detail_url(self.course)).status_code,
            401,
        )

    def test_student_can_read_view_and_download(self):
        self.client.force_login(self.student)

        self.assertEqual(self.client.get(LIST_URL).status_code, 200)
        self.assertEqual(self.client.get(detail_url(self.course)).status_code, 200)
        self.assertEqual(self.client.get(file_url(self.course)).status_code, 200)
        self.assertEqual(self.client.get(download_url(self.course)).status_code, 200)

    def test_student_cannot_write(self):
        self.client.force_login(self.student)
        initial_count = Course.objects.count()

        create_response = self.client.post(
            LIST_URL,
            {"title": "Interdit", "file": pdf_upload()},
            format="multipart",
        )
        patch_response = self.client.patch(
            detail_url(self.course),
            {"title": "Modifié"},
            format="json",
        )
        put_response = self.client.put(
            detail_url(self.course),
            {"title": "Remplacé"},
            format="multipart",
        )
        delete_response = self.client.delete(detail_url(self.course))

        self.assertEqual(create_response.status_code, 403)
        self.assertEqual(patch_response.status_code, 403)
        self.assertEqual(put_response.status_code, 403)
        self.assertEqual(delete_response.status_code, 403)
        self.assertEqual(
            create_response.json()["error"]["code"],
            "permission_denied",
        )
        self.assertEqual(Course.objects.count(), initial_count)

    def test_teacher_can_create_and_manage_own_course(self):
        self.client.force_login(self.teacher)

        create_response = self.client.post(
            LIST_URL,
            {"title": "Nouveau cours", "file": pdf_upload()},
            format="multipart",
        )
        self.assertEqual(create_response.status_code, 201)
        created = Course.objects.get(pk=create_response.json()["id"])
        self.assertEqual(created.owner, self.teacher)

        patch_response = self.client.patch(
            detail_url(created),
            {"title": "Titre mis à jour"},
            format="json",
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.json()["title"], "Titre mis à jour")

        delete_response = self.client.delete(detail_url(created))
        self.assertEqual(delete_response.status_code, 204)
        self.assertFalse(Course.objects.filter(pk=created.pk).exists())

    def test_teacher_cannot_modify_another_teachers_course(self):
        self.client.force_login(self.teacher)

        patch_response = self.client.patch(
            detail_url(self.other_course),
            {"title": "Tentative"},
            format="json",
        )
        delete_response = self.client.delete(detail_url(self.other_course))

        self.assertEqual(patch_response.status_code, 403)
        self.assertEqual(delete_response.status_code, 403)
        self.assertTrue(Course.objects.filter(pk=self.other_course.pk).exists())

    def test_admin_can_manage_any_course(self):
        self.client.force_login(self.admin)

        patch_response = self.client.patch(
            detail_url(self.other_course),
            {"title": "Modéré par admin"},
            format="json",
        )
        self.assertEqual(patch_response.status_code, 200)

        delete_response = self.client.delete(detail_url(self.other_course))
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Course.objects.filter(pk=self.other_course.pk).exists())

    def test_admin_can_create_course(self):
        self.client.force_login(self.admin)

        response = self.client.post(
            LIST_URL,
            {"title": "Cours admin", "file": pdf_upload()},
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["owner"], self.admin.pk)
