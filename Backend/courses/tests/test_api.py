from django.conf import settings
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import User
from courses.models import Course

from .utils import (
    TemporaryMediaMixin,
    create_course,
    pdf_upload,
    stored_bytes,
    wav_upload,
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
class CourseApiTests(TemporaryMediaMixin, APITestCase):
    password = "StrongPass123!"

    def setUp(self):
        self.teacher = User.objects.create_user(
            email="teacher@example.com",
            password=self.password,
            first_name="Thomas",
            last_name="Martin",
            role=User.Role.TEACHER,
        )
        self.course = create_course(
            self.teacher,
            title="Cours initial",
            description="Les bases",
        )
        self.client.force_login(self.teacher)

    def test_create_course_with_pdf(self):
        response = self.client.post(
            LIST_URL,
            {
                "title": "Nouveau cours",
                "description": "Description",
                "file": pdf_upload(),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["title"], "Nouveau cours")
        self.assertEqual(data["type"], "pdf")
        self.assertEqual(data["owner"], self.teacher.pk)
        self.assertEqual(data["owner_name"], "Thomas Martin")
        self.assertEqual(data["file_url"], f"/api/courses/{data['id']}/file/")
        self.assertNotIn("file", data)

        course = Course.objects.get(pk=data["id"])
        self.assertTrue(course.file.storage.exists(course.file.name))

    def test_create_rejects_invalid_file(self):
        response = self.client.post(
            LIST_URL,
            {"title": "Invalide", "file": pdf_upload(name="notes.txt")},
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("file", response.json()["error"]["fields"])

    def test_create_rejects_oversized_file(self):
        with override_settings(
            MAX_UPLOAD_SIZE_MB=1,
            MAX_UPLOAD_SIZE_BYTES=1024 * 1024,
        ):
            response = self.client.post(
                LIST_URL,
                {
                    "title": "Trop lourd",
                    "file": pdf_upload(
                        content=b"%PDF-1.4\n" + b"0" * (1024 * 1024)
                    ),
                },
                format="multipart",
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("file", response.json()["error"]["fields"])

    def test_client_cannot_override_type_or_owner(self):
        response = self.client.post(
            LIST_URL,
            {
                "title": "Sécurisé",
                "file": pdf_upload(),
                "type": "audio",
                "owner": 9999,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["type"], "pdf")
        self.assertEqual(data["owner"], self.teacher.pk)

    def test_detail_returns_course_and_missing_returns_json_404(self):
        response = self.client.get(detail_url(self.course))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["title"], "Cours initial")

        missing = self.client.get("/api/courses/999999/")
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.json()["error"]["code"], "not_found")

    def test_list_search_filter_order_and_pagination(self):
        create_course(
            self.teacher,
            title="Python avancé",
            description="Machine learning appliqué",
        )
        create_course(
            self.teacher,
            title="Podcast IA",
            description="Épisode audio",
            filename="podcast.wav",
        )

        search = self.client.get(LIST_URL, {"search": "machine"})
        self.assertEqual(search.status_code, 200)
        self.assertEqual(search.json()["count"], 1)
        self.assertEqual(search.json()["results"][0]["title"], "Python avancé")

        filtered = self.client.get(LIST_URL, {"type": "audio"})
        self.assertEqual(filtered.json()["count"], 1)
        self.assertEqual(filtered.json()["results"][0]["type"], "audio")

        ordered = self.client.get(LIST_URL, {"ordering": "title"})
        titles = [item["title"] for item in ordered.json()["results"]]
        self.assertEqual(titles, sorted(titles))

        paged = self.client.get(LIST_URL, {"page_size": 2})
        body = paged.json()
        self.assertEqual(body["count"], 3)
        self.assertEqual(len(body["results"]), 2)
        self.assertIsNotNone(body["next"])

    def test_invalid_type_filter_returns_400(self):
        response = self.client.get(LIST_URL, {"type": "image"})

        self.assertEqual(response.status_code, 400)
        self.assertIn("type", response.json()["error"]["fields"])

    def test_put_without_file_keeps_existing_file(self):
        original_name = self.course.file.name

        response = self.client.put(
            detail_url(self.course),
            {"title": "Titre remplacé", "description": "Nouvelle description"},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        self.course.refresh_from_db()
        self.assertEqual(self.course.title, "Titre remplacé")
        self.assertEqual(self.course.file.name, original_name)

    def test_update_with_new_file_replaces_old_file(self):
        old_storage = self.course.file.storage
        old_name = self.course.file.name

        response = self.client.patch(
            detail_url(self.course),
            {"file": wav_upload(), "title": "Cours audio"},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["type"], "audio")
        self.course.refresh_from_db()
        self.assertNotEqual(self.course.file.name, old_name)
        self.assertFalse(old_storage.exists(old_name))
        self.assertTrue(self.course.file.storage.exists(self.course.file.name))

    def test_delete_removes_course_and_file(self):
        storage = self.course.file.storage
        file_name = self.course.file.name

        response = self.client.delete(detail_url(self.course))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Course.objects.filter(pk=self.course.pk).exists())
        self.assertFalse(storage.exists(file_name))

    def test_pdf_is_served_inline(self):
        response = self.client.get(file_url(self.course))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response["Content-Disposition"].startswith("inline"))
        self.assertEqual(response["Accept-Ranges"], "bytes")
        self.assertEqual(response["Cache-Control"], "private, no-store")
        body = b"".join(response.streaming_content)
        self.assertEqual(body, stored_bytes(self.course))

    def test_download_is_served_as_attachment(self):
        response = self.client.get(download_url(self.course))

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response["Content-Disposition"].startswith("attachment"))
        self.assertIn(".pdf", response["Content-Disposition"])
        self.assertEqual(
            b"".join(response.streaming_content),
            stored_bytes(self.course),
        )

    def test_audio_is_seekable_with_range_requests(self):
        audio = create_course(
            self.teacher,
            title="Podcast",
            filename="podcast.wav",
        )
        size = audio.file.size

        response = self.client.get(file_url(audio), HTTP_RANGE="bytes=0-99")
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response["Content-Range"], f"bytes 0-99/{size}")
        self.assertEqual(len(b"".join(response.streaming_content)), 100)

        suffix = self.client.get(file_url(audio), HTTP_RANGE="bytes=-50")
        self.assertEqual(suffix.status_code, 206)
        self.assertEqual(len(b"".join(suffix.streaming_content)), 50)

        invalid = self.client.get(file_url(audio), HTTP_RANGE="bytes=999999-")
        self.assertEqual(invalid.status_code, 416)
        self.assertEqual(invalid["Content-Range"], f"bytes */{size}")

    def test_missing_file_returns_json_404(self):
        storage = self.course.file.storage
        storage.delete(self.course.file.name)

        response = self.client.get(file_url(self.course))

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"]["code"], "not_found")

    def test_media_url_is_not_publicly_routed(self):
        response = self.client.get(f"/media/{self.course.file.name}")

        self.assertEqual(response.status_code, 404)

    def test_config_endpoint_exposes_upload_limits(self):
        self.client.logout()

        response = self.client.get("/api/config/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["max_upload_size_mb"], settings.MAX_UPLOAD_SIZE_MB)
        self.assertEqual(
            data["max_upload_size_bytes"],
            settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
        )
        self.assertEqual(
            data["allowed_extensions"],
            ["pdf", "mp3", "wav", "m4a", "ogg", "mp4", "webm", "avi"],
        )
        self.assertEqual(data["pdf_extensions"], ["pdf"])
        self.assertIn("wav", data["audio_extensions"])
        self.assertEqual(data["video_extensions"], ["mp4", "webm", "avi"])
        self.assertEqual(
            data["max_video_upload_size_mb"],
            settings.MAX_VIDEO_UPLOAD_SIZE_MB,
        )
        self.assertEqual(
            data["thumbnail_max_size_mb"],
            settings.THUMBNAIL_MAX_SIZE_MB,
        )
        self.assertEqual(data["thumbnail_max_width"], 1920)
        self.assertEqual(data["thumbnail_max_height"], 1080)
