from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import User
from assessments.models import Exercise
from courses.tests.utils import TemporaryMediaMixin, pdf_upload, wav_upload

from .utils import create_course, create_exercise, make_user

LIST_URL = "/api/exercises/"


def form(course, **overrides):
    data = {
        "course": course.pk,
        "title": "Worksheet",
        "instructions": "Complete the attached worksheet.",
        "difficulty": "beginner",
        "points": 10,
        "is_published": "true",
    }
    data.update(overrides)
    return data


def stored(exercise):
    return exercise.attachment.storage.exists(exercise.attachment.name)


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class ExerciseAttachmentTests(TemporaryMediaMixin, APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)
        self.other_teacher = make_user("other@example.com", User.Role.TEACHER)
        self.student = make_user("student@example.com", User.Role.STUDENT)
        self.course = create_course(self.teacher)
        self.client.force_login(self.teacher)

    def create_with_pdf(self, **overrides):
        response = self.client.post(
            LIST_URL,
            form(self.course, attachment=pdf_upload(name="Worksheet 1.pdf"), **overrides),
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.json())
        return Exercise.objects.get(pk=response.json()["id"]), response.json()

    def test_create_with_pdf_attachment(self):
        exercise, data = self.create_with_pdf()

        self.assertEqual(data["attachment_name"], "Worksheet 1.pdf")
        self.assertEqual(data["attachment_type"], "pdf")
        self.assertEqual(data["attachment_url"], f"/api/exercises/{exercise.pk}/attachment/")
        self.assertNotIn("attachment", data)
        self.assertTrue(exercise.attachment.name.startswith("exercises/"))
        self.assertNotIn("Worksheet", exercise.attachment.name)
        self.assertTrue(stored(exercise))

    def test_create_without_attachment_and_null_due_date(self):
        response = self.client.post(LIST_URL, form(self.course, due_at=""), format="multipart")

        self.assertEqual(response.status_code, 201, response.json())
        self.assertIsNone(response.json()["attachment_url"])
        self.assertIsNone(response.json()["due_at"])

    def test_rejects_invalid_files(self):
        cases = [
            pdf_upload(name="notes.txt"),
            pdf_upload(name="fake.pdf", content=b"not really a pdf"),
            pdf_upload(name="empty.pdf", content=b""),
        ]
        for upload in cases:
            with self.subTest(name=upload.name):
                response = self.client.post(
                    LIST_URL, form(self.course, attachment=upload), format="multipart"
                )
                self.assertEqual(response.status_code, 400)
                self.assertIn("attachment", response.json()["error"]["fields"])
        self.assertFalse(Exercise.objects.exists())

    @override_settings(MAX_UPLOAD_SIZE_BYTES=100, MAX_UPLOAD_SIZE_MB=0)
    def test_rejects_oversized_file(self):
        response = self.client.post(
            LIST_URL, form(self.course, attachment=pdf_upload()), format="multipart"
        )

        self.assertEqual(response.status_code, 400)

    def test_student_can_view_and_download_published_attachment(self):
        exercise, _ = self.create_with_pdf()
        self.client.force_login(self.student)

        inline = self.client.get(f"/api/exercises/{exercise.pk}/attachment/")
        download = self.client.get(f"/api/exercises/{exercise.pk}/attachment/download/")

        self.assertEqual(inline.status_code, 200)
        self.assertEqual(inline["Content-Type"], "application/pdf")
        self.assertTrue(inline["Content-Disposition"].startswith("inline"))
        self.assertIn('filename="worksheet-1.pdf"', download["Content-Disposition"])
        self.assertTrue(download["Content-Disposition"].startswith("attachment"))
        self.assertEqual(inline["Cache-Control"], "private, no-store")
        self.assertTrue(b"".join(inline.streaming_content).startswith(b"%PDF"))

    def test_range_requests_are_supported(self):
        exercise, _ = self.create_with_pdf()

        response = self.client.get(
            f"/api/exercises/{exercise.pk}/attachment/", HTTP_RANGE="bytes=0-3"
        )

        self.assertEqual(response.status_code, 206)
        self.assertEqual(b"".join(response.streaming_content), b"%PDF")

    def test_draft_attachment_is_hidden_from_students(self):
        exercise, _ = self.create_with_pdf(is_published="false")
        self.client.force_login(self.student)

        self.assertEqual(self.client.get(f"/api/exercises/{exercise.pk}/attachment/").status_code, 404)

    def test_attachment_requires_authentication(self):
        exercise, _ = self.create_with_pdf()
        self.client.logout()

        self.assertEqual(self.client.get(f"/api/exercises/{exercise.pk}/attachment/").status_code, 401)

    def test_missing_attachment_returns_404(self):
        exercise = create_exercise(self.course)

        self.assertEqual(self.client.get(f"/api/exercises/{exercise.pk}/attachment/").status_code, 404)

    def test_replace_attachment_deletes_old_file(self):
        exercise, _ = self.create_with_pdf()
        old_name = exercise.attachment.name

        response = self.client.patch(
            f"/api/exercises/{exercise.pk}/",
            {"attachment": wav_upload(name="listening.wav")},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200, response.json())
        self.assertEqual(response.json()["attachment_type"], "audio")
        self.assertEqual(response.json()["attachment_name"], "listening.wav")
        exercise.refresh_from_db()
        self.assertTrue(stored(exercise))
        self.assertFalse(exercise.attachment.storage.exists(old_name))

    def test_patch_without_file_keeps_attachment(self):
        exercise, _ = self.create_with_pdf()

        response = self.client.patch(
            f"/api/exercises/{exercise.pk}/", {"title": "Renamed"}, format="multipart"
        )

        self.assertEqual(response.json()["attachment_name"], "Worksheet 1.pdf")
        exercise.refresh_from_db()
        self.assertTrue(stored(exercise))

    def test_remove_attachment(self):
        exercise, _ = self.create_with_pdf()
        old_name = exercise.attachment.name

        response = self.client.patch(
            f"/api/exercises/{exercise.pk}/", {"remove_attachment": "true"}, format="multipart"
        )

        self.assertIsNone(response.json()["attachment_url"])
        self.assertEqual(response.json()["attachment_name"], "")
        exercise.refresh_from_db()
        self.assertFalse(exercise.attachment)
        self.assertFalse(exercise.attachment.storage.exists(old_name))

    def test_deleting_exercise_or_course_deletes_file(self):
        exercise, _ = self.create_with_pdf()
        storage, name = exercise.attachment.storage, exercise.attachment.name

        self.client.delete(f"/api/exercises/{exercise.pk}/")

        self.assertFalse(storage.exists(name))

        exercise, _ = self.create_with_pdf()
        storage, name = exercise.attachment.storage, exercise.attachment.name
        self.course.delete()
        self.assertFalse(storage.exists(name))

    def test_other_teacher_cannot_change_attachment(self):
        exercise, _ = self.create_with_pdf()
        self.client.force_login(self.other_teacher)

        response = self.client.patch(
            f"/api/exercises/{exercise.pk}/", {"remove_attachment": "true"}, format="multipart"
        )

        self.assertEqual(response.status_code, 403)
        exercise.refresh_from_db()
        self.assertTrue(exercise.attachment)
