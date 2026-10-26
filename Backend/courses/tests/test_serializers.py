from django.test import TestCase, override_settings

from accounts.models import User
from courses.models import Course
from courses.serializers import CourseSerializer

from .utils import (
    TemporaryMediaMixin,
    create_course,
    pdf_upload,
    stored_bytes,
    wav_upload,
)


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class CourseSerializerTests(TemporaryMediaMixin, TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            email="teacher@example.com",
            password="StrongPass123!",
            first_name="Thomas",
            last_name="Martin",
            role=User.Role.TEACHER,
        )

    def test_create_sets_owner_and_derived_type(self):
        serializer = CourseSerializer(
            data={
                "title": "Cours de test",
                "description": "Une description",
                "file": pdf_upload(),
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        course = serializer.save(owner=self.teacher)

        self.assertEqual(course.owner, self.teacher)
        self.assertEqual(course.type, Course.Type.PDF)
        self.assertEqual(course.description, "Une description")
        self.assertTrue(course.file.storage.exists(course.file.name))

    def test_description_is_optional(self):
        serializer = CourseSerializer(
            data={"title": "Sans description", "file": pdf_upload()}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        course = serializer.save(owner=self.teacher)

        self.assertEqual(course.description, "")

    def test_file_is_optional_so_lesson_courses_can_be_created(self):
        serializer = CourseSerializer(data={"title": "Cours à leçons"})

        self.assertTrue(serializer.is_valid(), serializer.errors)

        course = serializer.save(owner=self.teacher)

        self.assertEqual(course.title, "Cours à leçons")
        self.assertFalse(bool(course.file))

    def test_blank_title_is_rejected(self):
        serializer = CourseSerializer(
            data={"title": "   ", "file": pdf_upload()}
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("title", serializer.errors)

    def test_type_cannot_be_set_by_client(self):
        serializer = CourseSerializer(
            data={"title": "Cours", "file": pdf_upload(), "type": "audio"}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        course = serializer.save(owner=self.teacher)

        self.assertEqual(course.type, Course.Type.PDF)

    def test_owner_cannot_be_spoofed(self):
        other = User.objects.create_user(
            email="other@example.com",
            password="StrongPass123!",
            role=User.Role.TEACHER,
        )
        serializer = CourseSerializer(
            data={"title": "Cours", "file": pdf_upload(), "owner": other.pk}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        course = serializer.save(owner=self.teacher)

        self.assertEqual(course.owner, self.teacher)

    def test_output_uses_private_urls_and_readable_metadata(self):
        course = create_course(self.teacher, title="Cours privé")
        data = CourseSerializer(course).data

        self.assertNotIn("file", data)
        self.assertTrue(data["file_url"].startswith("/api/courses/"))
        self.assertIn("file/", data["file_url"])
        self.assertTrue(data["download_url"].endswith("/download/"))
        self.assertEqual(data["owner_name"], "Thomas Martin")
        self.assertEqual(data["type_display"], "PDF")
        self.assertNotIn("/media/", data["file_url"])

    def test_update_without_file_keeps_existing_file(self):
        course = create_course(self.teacher)
        original_name = course.file.name
        serializer = CourseSerializer(
            course,
            data={"title": "Titre modifié"},
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        updated = serializer.save()

        self.assertEqual(updated.title, "Titre modifié")
        self.assertEqual(updated.file.name, original_name)
        self.assertEqual(updated.type, Course.Type.PDF)

    def test_replacing_file_deletes_old_file_and_updates_type(self):
        course = create_course(self.teacher)
        old_storage = course.file.storage
        old_name = course.file.name

        serializer = CourseSerializer(
            course,
            data={"file": wav_upload()},
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        updated = serializer.save()

        self.assertEqual(updated.type, Course.Type.AUDIO)
        self.assertNotEqual(updated.file.name, old_name)
        self.assertFalse(old_storage.exists(old_name))
        self.assertTrue(updated.file.storage.exists(updated.file.name))
        self.assertTrue(stored_bytes(updated).startswith(b"RIFF"))

    def test_update_rejects_invalid_file(self):
        course = create_course(self.teacher)
        serializer = CourseSerializer(
            course,
            data={"file": pdf_upload(name="notes.txt", content_type="text/plain")},
            partial=True,
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("file", serializer.errors)
