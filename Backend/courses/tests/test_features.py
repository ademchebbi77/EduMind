from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from courses.models import Category, Course, CourseProgress, Enrollment

from .utils import (
    MP4_BYTES,
    TemporaryMediaMixin,
    avi_upload,
    create_course,
    image_upload,
    mp4_upload,
    pdf_upload,
    webm_upload,
)

CATEGORY_URL = "/api/categories/"
COURSE_URL = "/api/courses/"
ENROLLMENT_URL = "/api/course-enrollments/"


def course_detail(course):
    return f"/api/courses/{course.pk}/"


def course_thumbnail(course):
    return f"/api/courses/{course.pk}/thumbnail/"


def enroll_url(course):
    return f"/api/courses/{course.pk}/enroll/"


def unenroll_url(course):
    return f"/api/courses/{course.pk}/unenroll/"


def course_progress(course):
    return f"/api/courses/{course.pk}/progress/"


def enrollment_detail(enrollment):
    return f"/api/course-enrollments/{enrollment.pk}/"


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class CourseFeatureTestCase(TemporaryMediaMixin, APITestCase):
    password = "StrongPass123!"

    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin@example.com",
            password=self.password,
            first_name="Amina",
            last_name="Admin",
            role=User.Role.ADMIN,
        )
        self.teacher = User.objects.create_user(
            email="teacher@example.com",
            password=self.password,
            first_name="Thomas",
            last_name="Martin",
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
        self.other_student = User.objects.create_user(
            email="student2@example.com",
            password=self.password,
            first_name="Sacha",
            last_name="Student",
            role=User.Role.STUDENT,
        )
        self.course = create_course(self.teacher, title="Python pour débutants")


class CategoryApiTests(CourseFeatureTestCase):
    def test_teacher_creates_category_with_generated_slug(self):
        self.client.force_login(self.teacher)

        response = self.client.post(
            CATEGORY_URL,
            {"name": "Python", "description": "Langage Python"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertEqual(data["name"], "Python")
        self.assertEqual(data["slug"], "python")
        self.assertEqual(data["description"], "Langage Python")

    def test_duplicate_category_name_is_rejected(self):
        Category.objects.create(name="Python")
        self.client.force_login(self.teacher)

        response = self.client.post(
            CATEGORY_URL,
            {"name": "Python"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", response.json()["error"]["fields"])

    def test_student_cannot_manage_categories(self):
        self.client.force_login(self.student)

        create_response = self.client.post(
            CATEGORY_URL,
            {"name": "Design"},
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Category.objects.count(), 0)

    def test_students_can_list_categories(self):
        Category.objects.create(name="Python")
        Category.objects.create(name="Design")
        self.client.force_login(self.student)

        response = self.client.get(CATEGORY_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [item["name"] for item in response.json()["results"]]
        self.assertEqual(names, ["Design", "Python"])

    def test_slug_collisions_get_a_suffix(self):
        first = Category.objects.create(name="Python!")
        second = Category.objects.create(name="Python?")

        self.assertEqual(first.slug, "python")
        self.assertEqual(second.slug, "python-2")


class CourseMetadataApiTests(CourseFeatureTestCase):
    def test_course_can_have_category_tags_and_thumbnail(self):
        category = Category.objects.create(name="Python")
        self.client.force_login(self.teacher)

        response = self.client.post(
            COURSE_URL,
            {
                "title": "Cours Python",
                "file": pdf_upload(),
                "category": category.pk,
                "tags": "python, beginner, python",
                "thumbnail": image_upload(),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertEqual(data["category"], category.pk)
        self.assertEqual(data["category_name"], "Python")
        self.assertEqual(data["category_slug"], "python")
        self.assertEqual(data["tags"], ["python", "beginner"])
        self.assertEqual(
            data["thumbnail_url"],
            f"/api/courses/{data['id']}/thumbnail/",
        )
        self.assertEqual(data["enrolled_count"], 0)
        self.assertFalse(data["is_full"])
        self.assertFalse(data["is_enrolled"])
        self.assertFalse(data["can_enroll"])

        course = Course.objects.get(pk=data["id"])
        self.assertTrue(course.thumbnail.storage.exists(course.thumbnail.name))

    def test_thumbnail_is_served_to_authenticated_users(self):
        self.client.force_login(self.teacher)
        course = Course.objects.get(pk=self.course.pk)
        course.thumbnail.save("thumb.png", image_upload(), save=True)
        self.course.refresh_from_db()

        response = self.client.get(course_thumbnail(self.course))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "image/png")
        self.assertEqual(response["Content-Disposition"], "inline")
        self.assertGreater(len(b"".join(response.streaming_content)), 0)

    def test_missing_thumbnail_returns_json_404(self):
        self.client.force_login(self.student)

        response = self.client.get(course_thumbnail(self.course))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.json()["error"]["code"], "not_found")

    def test_replacing_thumbnail_deletes_the_previous_file(self):
        self.client.force_login(self.teacher)
        self.client.patch(
            course_detail(self.course),
            {"thumbnail": image_upload("first.png")},
            format="multipart",
        )
        self.course.refresh_from_db()
        storage = self.course.thumbnail.storage
        old_name = self.course.thumbnail.name
        self.assertTrue(storage.exists(old_name))

        response = self.client.patch(
            course_detail(self.course),
            {"thumbnail": image_upload("second.png")},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.course.refresh_from_db()

        self.assertNotEqual(self.course.thumbnail.name, old_name)
        self.assertFalse(storage.exists(old_name))
        self.assertTrue(storage.exists(self.course.thumbnail.name))

    def test_deleting_course_removes_the_thumbnail(self):
        self.client.force_login(self.teacher)
        course = Course.objects.get(pk=self.course.pk)
        course.thumbnail.save("thumb.png", image_upload(), save=True)
        storage = course.thumbnail.storage
        thumbnail_name = course.thumbnail.name

        response = self.client.delete(course_detail(course))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(storage.exists(thumbnail_name))

    def test_category_and_tags_filters(self):
        python = Category.objects.create(name="Python")
        design = Category.objects.create(name="Design")
        tagged = create_course(self.teacher, title="Cours Python")
        tagged.category = python
        tagged.tags = "python,beginner"
        tagged.save()
        other = create_course(self.teacher, title="Cours Design")
        other.category = design
        other.tags = "design"
        other.save()

        self.client.force_login(self.student)

        by_category = self.client.get(COURSE_URL, {"category": "python"})
        self.assertEqual(by_category.json()["count"], 1)
        self.assertEqual(by_category.json()["results"][0]["id"], tagged.pk)

        by_tag = self.client.get(COURSE_URL, {"tags": "beginner"})
        self.assertEqual(by_tag.json()["count"], 1)
        self.assertEqual(by_tag.json()["results"][0]["id"], tagged.pk)

        all_tags = self.client.get(COURSE_URL, {"tags": "beginner,django"})
        self.assertEqual(all_tags.json()["count"], 0)

    def test_video_file_upload_sets_video_type(self):
        self.client.force_login(self.teacher)

        for upload in (mp4_upload(), webm_upload(), avi_upload()):
            with self.subTest(upload=upload.name):
                response = self.client.post(
                    COURSE_URL,
                    {"title": f"Cours {upload.name}", "file": upload},
                    format="multipart",
                )
                self.assertEqual(
                    response.status_code, status.HTTP_201_CREATED
                )
                self.assertEqual(response.json()["type"], "video")

    def test_external_video_url_sets_video_type(self):
        self.client.force_login(self.teacher)

        response = self.client.post(
            COURSE_URL,
            {
                "title": "Cours YouTube",
                "video_url": "https://www.youtube.com/watch?v=abc123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertEqual(data["type"], "video")
        self.assertEqual(
            data["video_url"], "https://www.youtube.com/watch?v=abc123"
        )

    def test_unsupported_video_url_is_rejected(self):
        self.client.force_login(self.teacher)

        response = self.client.post(
            COURSE_URL,
            {
                "title": "Lien invalide",
                "video_url": "https://example.com/video",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("video_url", response.json()["error"]["fields"])

    def test_course_can_be_created_without_a_file_for_lessons(self):
        self.client.force_login(self.teacher)

        response = self.client.post(
            COURSE_URL,
            {"title": "Cours à leçons"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertFalse(data["has_file"])
        self.assertEqual(data["lesson_count"], 0)

    def test_thumbnail_dimensions_are_limited(self):
        self.client.force_login(self.teacher)

        response = self.client.post(
            COURSE_URL,
            {
                "title": "Miniature trop large",
                "file": pdf_upload(),
                "thumbnail": image_upload(size=(1921, 100)),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("thumbnail", response.json()["error"]["fields"])

    @override_settings(
        THUMBNAIL_MAX_SIZE_MB=1,
        THUMBNAIL_MAX_SIZE_BYTES=1024 * 1024,
    )
    def test_thumbnail_size_is_limited(self):
        content = image_upload().read() + b"\x00" * (1024 * 1024)
        oversized = SimpleUploadedFile(
            "huge.png",
            content,
            content_type="image/png",
        )
        self.client.force_login(self.teacher)

        response = self.client.post(
            COURSE_URL,
            {"title": "Miniature trop lourde", "thumbnail": oversized},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("thumbnail", response.json()["error"]["fields"])


class EnrollmentApiTests(CourseFeatureTestCase):
    def enroll(self, user=None):
        user = user or self.student
        self.client.force_login(user)
        return self.client.post(enroll_url(self.course), {}, format="json")

    def test_student_can_enroll_and_count_increments(self):
        response = self.enroll()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertEqual(data["course"], self.course.pk)
        self.assertEqual(data["student"], self.student.pk)
        self.assertEqual(data["student_name"], "Sam Student")
        self.assertEqual(data["progress"], 0)
        self.assertFalse(data["completed"])

        self.course.refresh_from_db()
        self.assertEqual(self.course.enrolled_count, 1)
        self.assertTrue(
            Enrollment.objects.filter(
                course=self.course, student=self.student
            ).exists()
        )

        detail = self.client.get(course_detail(self.course)).json()
        self.assertTrue(detail["is_enrolled"])
        self.assertFalse(detail["can_enroll"])
        self.assertEqual(detail["enrolled_count"], 1)

    def test_student_cannot_enroll_twice(self):
        self.enroll()

        response = self.enroll()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.course.refresh_from_db()
        self.assertEqual(self.course.enrolled_count, 1)

    def test_teacher_cannot_enroll(self):
        response = self.enroll(self.teacher)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.course.refresh_from_db()
        self.assertEqual(self.course.enrolled_count, 0)

    def test_student_can_unenroll_and_count_decrements(self):
        self.enroll()

        response = self.client.post(unenroll_url(self.course), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.course.refresh_from_db()
        self.assertEqual(self.course.enrolled_count, 0)
        self.assertFalse(
            Enrollment.objects.filter(
                course=self.course, student=self.student
            ).exists()
        )

    def test_enrolled_count_never_goes_below_zero(self):
        self.client.force_login(self.student)

        response = self.client.post(
            unenroll_url(self.course), {}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.course.refresh_from_db()
        self.assertEqual(self.course.enrolled_count, 0)

    def test_full_course_rejects_new_enrollments(self):
        self.course.max_students = 1
        self.course.save()
        self.enroll()

        response = self.enroll(self.other_student)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.course.refresh_from_db()
        self.assertEqual(self.course.enrolled_count, 1)
        self.assertTrue(self.course.is_full)

    def test_my_courses_returns_enrolled_courses_only(self):
        create_course(self.teacher, title="Cours non suivi")
        self.enroll()

        response = self.client.get(f"{COURSE_URL}my-courses/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(body["count"], 1)
        self.assertEqual(body["results"][0]["id"], self.course.pk)
        self.assertTrue(body["results"][0]["is_enrolled"])

    def test_student_can_create_enrollment_through_enrollments_endpoint(self):
        self.client.force_login(self.student)

        response = self.client.post(
            ENROLLMENT_URL,
            {"course": self.course.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.course.refresh_from_db()
        self.assertEqual(self.course.enrolled_count, 1)

    def test_teacher_cannot_create_enrollment_record(self):
        self.client.force_login(self.teacher)

        response = self.client.post(
            ENROLLMENT_URL,
            {"course": self.course.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_enrollment_list_is_scoped_by_role(self):
        other_course = create_course(
            self.other_teacher, title="Cours voisin"
        )
        self.enroll()
        other_enrollment = Enrollment.objects.create(
            course=other_course, student=self.other_student
        )
        student_enrollment = Enrollment.objects.get(
            course=self.course, student=self.student
        )

        self.client.force_login(self.student)
        self.assertEqual(
            self.client.get(ENROLLMENT_URL).json()["count"], 1
        )

        self.client.force_login(self.teacher)
        teacher_body = self.client.get(ENROLLMENT_URL).json()
        self.assertEqual(teacher_body["count"], 1)
        self.assertEqual(
            teacher_body["results"][0]["student_email"], self.student.email
        )

        denied = self.client.get(
            enrollment_detail(other_enrollment),
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_login(self.other_teacher)
        other_teacher_body = self.client.get(ENROLLMENT_URL).json()
        self.assertEqual(other_teacher_body["count"], 1)
        self.assertEqual(
            other_teacher_body["results"][0]["id"],
            other_enrollment.pk,
        )
        self.assertEqual(
            self.client.get(enrollment_detail(student_enrollment)).status_code,
            status.HTTP_404_NOT_FOUND,
        )

        self.client.force_login(self.admin)
        self.assertEqual(
            self.client.get(ENROLLMENT_URL).json()["count"], 2
        )

    def test_enrollment_creates_an_empty_progress_record(self):
        response = self.enroll()

        self.assertTrue(
            CourseProgress.objects.filter(
                enrollment_id=response.json()["id"]
            ).exists()
        )

    def test_opening_a_course_does_not_complete_it(self):
        self.enroll()
        self.client.force_login(self.student)

        initial = self.client.get(course_progress(self.course)).json()

        self.assertEqual(initial["progress"], 0)
        self.assertFalse(initial["completed"])
        self.assertFalse(initial["has_opened_material"])
        self.assertIsNone(initial["first_viewed_at"])
        self.assertIsNone(initial["last_viewed_at"])
        self.assertEqual(initial["total_pages"], 1)

        enrollment = Enrollment.objects.get(
            course=self.course, student=self.student
        )
        self.assertFalse(enrollment.completed)
        self.assertIsNone(enrollment.completed_at)

    def test_pdf_progress_tracks_pages_viewed(self):
        self.enroll()
        self.client.force_login(self.student)

        response = self.client.post(
            course_progress(self.course),
            {"pages_viewed": 1, "has_opened_material": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["total_pages"], 1)
        self.assertEqual(data["pages_viewed"], 1)
        self.assertEqual(data["progress"], 100)
        self.assertTrue(data["completed"])
        self.assertIsNotNone(data["completed_at"])
        self.assertTrue(data["has_opened_material"])
        self.assertIsNotNone(data["first_viewed_at"])
        self.assertIsNotNone(data["last_viewed_at"])

        enrollment = Enrollment.objects.get(
            course=self.course, student=self.student
        )
        self.assertTrue(enrollment.completed)
        self.assertIsNotNone(enrollment.completed_at)

    def test_video_progress_uses_watched_seconds(self):
        video = create_course(
            self.teacher,
            title="Video course",
            filename="lesson.mp4",
            content=MP4_BYTES,
        )
        self.client.force_login(self.student)
        self.client.post(enroll_url(video), {}, format="json")

        partial = self.client.post(
            course_progress(video),
            {
                "video_duration_seconds": 100,
                "video_watched_seconds": 25,
                "last_position_seconds": 30,
            },
            format="json",
        ).json()

        self.assertEqual(partial["progress"], 25)
        self.assertEqual(partial["video_duration_seconds"], 100)
        self.assertEqual(partial["video_watched_seconds"], 25)
        self.assertEqual(partial["last_position_seconds"], 30)
        self.assertTrue(partial["has_opened_material"])
        self.assertFalse(partial["completed"])

        rewind = self.client.post(
            course_progress(video),
            {"video_watched_seconds": 10, "last_position_seconds": 10},
            format="json",
        ).json()

        self.assertEqual(rewind["video_watched_seconds"], 25)
        self.assertEqual(rewind["progress"], 25)

        finished = self.client.post(
            course_progress(video),
            {"video_watched_seconds": 100, "last_position_seconds": 100},
            format="json",
        ).json()

        self.assertEqual(finished["progress"], 100)
        self.assertTrue(finished["completed"])
        self.assertIsNotNone(finished["completed_at"])

        enrollment = Enrollment.objects.get(course=video, student=self.student)
        self.assertTrue(enrollment.completed)
        self.assertIsNotNone(enrollment.completed_at)

    def test_progress_values_are_clamped(self):
        video = create_course(
            self.teacher,
            title="Clamped video",
            filename="clamped.mp4",
            content=MP4_BYTES,
        )
        self.client.force_login(self.student)
        self.client.post(enroll_url(video), {}, format="json")

        data = self.client.post(
            course_progress(video),
            {
                "video_duration_seconds": 60,
                "video_watched_seconds": 500,
                "last_position_seconds": 900,
            },
            format="json",
        ).json()

        self.assertEqual(data["video_watched_seconds"], 60)
        self.assertEqual(data["last_position_seconds"], 60)
        self.assertEqual(data["progress"], 100)
        self.assertTrue(data["completed"])

    def test_invalid_progress_payload_is_rejected(self):
        self.enroll()
        self.client.force_login(self.student)

        negative = self.client.post(
            course_progress(self.course),
            {"video_duration_seconds": -1},
            format="json",
        )
        self.assertEqual(negative.status_code, status.HTTP_400_BAD_REQUEST)

        invalid = self.client.post(
            course_progress(self.course),
            {"pages_viewed": "many"},
            format="json",
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

    def test_enrollment_serializer_exposes_viewing_progress(self):
        video = create_course(
            self.teacher,
            title="Tracked video",
            filename="tracked.mp4",
            content=MP4_BYTES,
        )
        self.client.force_login(self.student)
        self.client.post(enroll_url(video), {}, format="json")
        self.client.post(
            course_progress(video),
            {
                "video_duration_seconds": 200,
                "video_watched_seconds": 50,
                "last_position_seconds": 70,
            },
            format="json",
        )

        self.client.force_login(self.teacher)
        row = self.client.get(ENROLLMENT_URL).json()["results"][0]

        self.assertEqual(row["progress"], 25)
        self.assertFalse(row["completed"])
        self.assertIsNone(row["completed_at"])
        self.assertTrue(row["has_opened_material"])
        self.assertEqual(row["video_duration_seconds"], 200)
        self.assertEqual(row["video_watched_seconds"], 50)
        self.assertEqual(row["last_position_seconds"], 70)
        self.assertIsNotNone(row["last_viewed_at"])

    def test_progress_and_completion_are_read_only(self):
        self.enroll()
        enrollment = Enrollment.objects.get(
            course=self.course, student=self.student
        )

        self.client.force_login(self.student)
        response = self.client.patch(
            enrollment_detail(enrollment),
            {"progress": 100},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        self.client.force_login(self.teacher)
        response = self.client.patch(
            enrollment_detail(enrollment),
            {"completed": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_progress_requires_enrollment(self):
        self.client.force_login(self.student)

        self.assertEqual(
            self.client.get(course_progress(self.course)).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                course_progress(self.course), {}, format="json"
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_teacher_cannot_view_or_record_student_progress(self):
        self.enroll()
        self.client.force_login(self.teacher)

        self.assertEqual(
            self.client.get(course_progress(self.course)).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                course_progress(self.course),
                {"pages_viewed": 1},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_recording_progress_is_idempotent(self):
        video = create_course(
            self.teacher,
            title="Repeated progress",
            filename="repeat.mp4",
            content=MP4_BYTES,
        )
        self.client.force_login(self.student)
        self.client.post(enroll_url(video), {}, format="json")

        payload = {
            "video_duration_seconds": 120,
            "video_watched_seconds": 30,
            "last_position_seconds": 30,
        }
        first = self.client.post(
            course_progress(video), payload, format="json"
        ).json()
        second = self.client.post(
            course_progress(video), payload, format="json"
        ).json()

        self.assertEqual(first["progress"], second["progress"])
        self.assertEqual(
            first["video_watched_seconds"], second["video_watched_seconds"]
        )
        self.assertEqual(first["first_viewed_at"], second["first_viewed_at"])

    def test_deleting_enrollment_decrements_count(self):
        self.enroll()
        enrollment = Enrollment.objects.get(
            course=self.course, student=self.student
        )
        self.client.force_login(self.student)

        response = self.client.delete(enrollment_detail(enrollment))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.course.refresh_from_db()
        self.assertEqual(self.course.enrolled_count, 0)

    def test_model_level_enrollment_changes_keep_count_in_sync(self):
        enrollment = Enrollment.objects.create(
            course=self.course, student=self.student
        )
        self.course.refresh_from_db()
        self.assertEqual(self.course.enrolled_count, 1)

        enrollment.delete()
        self.course.refresh_from_db()
        self.assertEqual(self.course.enrolled_count, 0)
