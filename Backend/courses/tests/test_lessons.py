from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Max
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase

from accounts.models import User
from courses.models import (
    Course,
    Enrollment,
    Lesson,
    LessonCompletion,
)

from .utils import (
    TemporaryMediaMixin,
    create_course,
    mp4_upload,
    pdf_upload,
    wav_upload,
)
from ..models import CourseProgress


def create_lesson(
    course,
    title,
    filename="document.pdf",
    order=None,
    video_url="",
    **kwargs,
):
    if order is None:
        order = (course.lessons.aggregate(max=Max("order"))["max"] or 0) + 1
    file_content = None
    if filename:
        if filename.endswith(".pdf"):
            file_content = pdf_upload()
        elif filename.endswith(".mp4"):
            file_content = mp4_upload()
        else:
            file_content = wav_upload(name=filename)
    lesson = Lesson(
        course=course,
        title=title,
        order=order,
        file=file_content,
        video_url=video_url,
        **kwargs,
    )
    lesson.save()
    return lesson


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class LessonModelTests(TemporaryMediaMixin, TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            email="teacher@example.com",
            password="StrongPass123!",
            role=User.Role.TEACHER,
        )
        self.student = User.objects.create_user(
            email="student@example.com",
            password="StrongPass123!",
            role=User.Role.STUDENT,
        )
        self.course = create_course(self.teacher)

    def test_file_type_is_detected_from_extension(self):
        pdf = create_lesson(self.course, "Intro", filename="intro.pdf")
        video = create_lesson(self.course, "Video", filename="clip.mp4")
        audio = create_lesson(self.course, "Audio", filename="podcast.wav")

        self.assertEqual(pdf.file_type, Lesson.FileType.PDF)
        self.assertEqual(video.file_type, Lesson.FileType.VIDEO)
        self.assertEqual(audio.file_type, Lesson.FileType.AUDIO)

    def test_first_lesson_sets_course_type(self):
        course = Course(title="Cours sans matériel", owner=self.teacher)
        course.save()
        self.assertEqual(course.type, "")
        create_lesson(course, "Intro", filename="intro.pdf")
        course.refresh_from_db()
        self.assertEqual(course.type, Course.Type.PDF)

    def test_video_only_lesson_sets_video_file_type(self):
        course = Course(title="Cours vidéo", owner=self.teacher)
        course.save()

        lesson = create_lesson(
            course,
            "Vidéo",
            filename=None,
            video_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        )

        self.assertEqual(lesson.file_type, Lesson.FileType.VIDEO)
        self.assertFalse(lesson.file)
        course.refresh_from_db()
        self.assertEqual(course.type, Course.Type.VIDEO)

    def test_lesson_can_have_a_file_and_a_video_url(self):
        lesson = create_lesson(
            self.course,
            "Mixte",
            filename="intro.pdf",
            video_url="https://vimeo.com/123456789",
        )

        self.assertEqual(lesson.file_type, Lesson.FileType.PDF)
        self.assertTrue(lesson.file)
        self.assertEqual(lesson.video_url, "https://vimeo.com/123456789")

    def test_lesson_requires_a_file_or_a_video_url(self):
        lesson = Lesson(course=self.course, title="Vide", order=1)

        with self.assertRaises(DjangoValidationError):
            lesson.full_clean()

    def test_unique_together_course_order(self):
        create_lesson(self.course, "Un", order=1)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                create_lesson(self.course, "Deux", order=1)

    def test_first_lesson_is_never_locked(self):
        first = create_lesson(self.course, "Un", order=1)
        second = create_lesson(self.course, "Deux", order=2)

        self.assertFalse(first.is_locked_for(self.student))
        self.assertTrue(second.is_locked_for(self.student))

    def test_completing_previous_unlocks_next(self):
        first = create_lesson(self.course, "Un", order=1)
        second = create_lesson(self.course, "Deux", order=2)

        first.mark_completed(self.student)

        self.assertFalse(second.is_locked_for(self.student))
        self.assertFalse(first.is_locked_for(self.student))

    def test_completed_lesson_stays_accessible_after_reorder(self):
        first = create_lesson(self.course, "Un", order=1)
        second = create_lesson(self.course, "Deux", order=2)
        second.mark_completed(self.student)

        # Move "Deux" behind a fresh lesson: it is completed, so it must
        # remain unlocked even though its predecessor is not.
        third = create_lesson(self.course, "Trois", order=3)
        second.order = 4
        second.save(update_fields=["order"])
        third.order = 2
        third.save(update_fields=["order"])
        second.order = 3
        second.save(update_fields=["order"])

        self.assertFalse(second.is_locked_for(self.student))
        self.assertTrue(third.is_locked_for(self.student))

    def test_mark_completed_is_idempotent(self):
        lesson = create_lesson(self.course, "Un", order=1)

        first = lesson.mark_completed(self.student)
        second = lesson.mark_completed(self.student)

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(
            LessonCompletion.objects.filter(
                lesson=lesson, student=self.student
            ).count(),
            1,
        )
        self.assertTrue(first.completed)
        self.assertIsNotNone(first.completed_at)

    def test_unpublished_lessons_are_skipped_for_sequencing(self):
        first = create_lesson(self.course, "Un", order=1, is_published=False)
        second = create_lesson(self.course, "Deux", order=2)

        # "Deux" is the first published lesson, so it is unlocked.
        self.assertFalse(second.is_locked_for(self.student))
        self.assertIsNone(second.previous_published())

    def test_lesson_progress_for(self):
        first = create_lesson(self.course, "Un", order=1)
        second = create_lesson(self.course, "Deux", order=2)
        third = create_lesson(self.course, "Trois", order=3)

        summary = self.course.lesson_progress_for(self.student)
        self.assertEqual(summary["total_lessons"], 3)
        self.assertEqual(summary["completed_lessons"], 0)
        self.assertEqual(summary["locked_lessons"], 2)
        self.assertEqual(summary["percentage"], 0)
        self.assertFalse(summary["statuses"][first.pk]["is_locked"])
        self.assertTrue(summary["statuses"][second.pk]["is_locked"])
        self.assertTrue(summary["statuses"][third.pk]["is_locked"])

        first.mark_completed(self.student)
        second.mark_completed(self.student)

        summary = self.course.lesson_progress_for(self.student)
        self.assertEqual(summary["completed_lessons"], 2)
        self.assertEqual(summary["locked_lessons"], 0)
        self.assertEqual(summary["percentage"], round(2 * 100 / 3, 2))
        self.assertFalse(summary["statuses"][third.pk]["is_locked"])
        self.assertIsNotNone(summary["statuses"][first.pk]["completed_at"])

    def test_lesson_progress_for_empty_course(self):
        summary = self.course.lesson_progress_for(self.student)
        self.assertEqual(summary["total_lessons"], 0)
        self.assertEqual(summary["percentage"], 0)

    def test_course_progress_percentage_follows_lessons(self):
        enrollment = Enrollment.objects.create(
            course=self.course, student=self.student
        )
        CourseProgress.objects.create(enrollment=enrollment)
        first = create_lesson(self.course, "Un", order=1)
        create_lesson(self.course, "Deux", order=2)

        self.assertEqual(enrollment.course_progress.percentage, 0)

        first.mark_completed(self.student)

        self.assertEqual(enrollment.course_progress.percentage, 50)

    def test_course_progress_percentage_is_media_based_without_lessons(self):
        enrollment = Enrollment.objects.create(
            course=self.course, student=self.student
        )
        progress = CourseProgress.objects.create(enrollment=enrollment)
        progress.total_pages = 100
        progress.pages_viewed = 40
        progress.save(update_fields=["total_pages", "pages_viewed"])
        self.assertEqual(progress.percentage, 40)


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class LessonApiTests(TemporaryMediaMixin, APITestCase):
    password = "StrongPass123!"

    def setUp(self):
        self.teacher = User.objects.create_user(
            email="teacher@example.com",
            password=self.password,
            role=User.Role.TEACHER,
        )
        self.other_teacher = User.objects.create_user(
            email="other-teacher@example.com",
            password=self.password,
            role=User.Role.TEACHER,
        )
        self.student = User.objects.create_user(
            email="student@example.com",
            password=self.password,
            role=User.Role.STUDENT,
        )
        self.course = create_course(self.teacher, title="Cours à leçons")
        self.lessons_url = f"/api/courses/{self.course.pk}/lessons/"

    def lesson_url(self, lesson):
        return f"{self.lessons_url}{lesson.pk}/"

    def action_url(self, lesson, action):
        return f"{self.lessons_url}{lesson.pk}/{action}/"

    def enroll(self):
        return Enrollment.objects.create(
            course=self.course, student=self.student
        )

    # ------------------------------------------------------------- teacher

    def test_teacher_creates_lesson_with_automatic_order(self):
        self.client.force_login(self.teacher)
        response = self.client.post(
            self.lessons_url,
            {"title": "Introduction", "file": pdf_upload()},
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["order"], 1)
        self.assertEqual(data["file_type"], "pdf")
        self.assertEqual(data["course"], self.course.pk)
        self.assertTrue(data["file_url"].startswith(self.lessons_url))
        self.assertTrue(data["is_published"])
        self.assertFalse(data["is_locked"])

    def test_teacher_creates_lesson_with_explicit_order_shifts_others(self):
        first = create_lesson(self.course, "Un", order=1)
        self.client.force_login(self.teacher)
        response = self.client.post(
            self.lessons_url,
            {"title": "Inséré", "file": pdf_upload(), "order": 1},
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        first.refresh_from_db()
        self.assertEqual(first.order, 2)
        self.assertEqual(response.json()["order"], 1)

    def test_lesson_requires_a_file_or_a_video_url(self):
        self.client.force_login(self.teacher)
        response = self.client.post(
            self.lessons_url, {"title": "Sans contenu"}, format="multipart"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("file", response.json()["error"]["fields"])

    def test_teacher_creates_video_only_lesson(self):
        self.client.force_login(self.teacher)

        response = self.client.post(
            self.lessons_url,
            {
                "title": "Vidéo YouTube",
                "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["file_type"], "video")
        self.assertIsNone(data["file_url"])
        self.assertEqual(
            data["video_url"], "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        )
        self.assertTrue(data["is_published"])

    def test_teacher_creates_lesson_with_file_and_video_url(self):
        self.client.force_login(self.teacher)

        response = self.client.post(
            self.lessons_url,
            {
                "title": "Support et vidéo",
                "file": pdf_upload(),
                "video_url": "https://vimeo.com/123456789",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["file_type"], "pdf")
        self.assertTrue(data["file_url"].startswith(self.lessons_url))
        self.assertEqual(data["video_url"], "https://vimeo.com/123456789")

    def test_update_keeps_existing_video_url(self):
        lesson = create_lesson(
            self.course,
            "Vidéo",
            filename=None,
            video_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        )
        self.client.force_login(self.teacher)

        response = self.client.patch(
            self.lesson_url(lesson), {"title": "Vidéo renommée"}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        lesson.refresh_from_db()
        self.assertEqual(lesson.title, "Vidéo renommée")
        self.assertEqual(
            lesson.video_url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        )

    def test_lesson_rejects_unsupported_video_urls(self):
        self.client.force_login(self.teacher)

        for invalid_url in (
            "https://example.com/watch?v=123",
            "not-a-url",
        ):
            response = self.client.post(
                self.lessons_url,
                {"title": "Lien invalide", "video_url": invalid_url},
                format="json",
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn(
                "video_url", response.json()["error"]["fields"]
            )

    def test_video_only_lesson_has_no_file_endpoint(self):
        lesson = create_lesson(
            self.course,
            "Vidéo",
            filename=None,
            video_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        )
        self.client.force_login(self.teacher)

        response = self.client.get(self.action_url(lesson, "file"))

        self.assertEqual(response.status_code, 404)

    def test_teacher_lists_all_lessons_including_unpublished(self):
        published = create_lesson(self.course, "Publiée", order=1)
        unpublished = create_lesson(
            self.course, "Brouillon", order=2, is_published=False
        )
        self.client.force_login(self.teacher)

        response = self.client.get(self.lessons_url)

        self.assertEqual(response.status_code, 200)
        ids = [item["id"] for item in response.json()]
        self.assertEqual(ids, [published.pk, unpublished.pk])

    def test_teacher_updates_lesson_and_replaces_file(self):
        lesson = create_lesson(self.course, "Titre", order=1)
        old_name = lesson.file.name
        self.client.force_login(self.teacher)

        response = self.client.patch(
            self.lesson_url(lesson),
            {
                "title": "Nouveau titre",
                "file": wav_upload(),
                "duration_minutes": 12,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        lesson.refresh_from_db()
        self.assertEqual(lesson.title, "Nouveau titre")
        self.assertEqual(lesson.file_type, Lesson.FileType.AUDIO)
        self.assertEqual(lesson.duration_minutes, 12)
        self.assertNotEqual(lesson.file.name, old_name)
        self.assertFalse(lesson.file.storage.exists(old_name))

    def test_teacher_reorders_lessons(self):
        first = create_lesson(self.course, "Un", order=1)
        second = create_lesson(self.course, "Deux", order=2)
        third = create_lesson(self.course, "Trois", order=3)
        self.client.force_login(self.teacher)

        response = self.client.post(
            f"{self.lessons_url}reorder/",
            {"lesson_ids": [third.pk, first.pk, second.pk]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        orders = {
            item["id"]: item["order"] for item in response.json()
        }
        self.assertEqual(
            orders, {third.pk: 1, first.pk: 2, second.pk: 3}
        )

    def test_reorder_rejects_unknown_or_missing_ids(self):
        first = create_lesson(self.course, "Un", order=1)
        second = create_lesson(self.course, "Deux", order=2)
        self.client.force_login(self.teacher)

        missing = self.client.post(
            f"{self.lessons_url}reorder/",
            {"lesson_ids": [first.pk]},
            format="json",
        )
        self.assertEqual(missing.status_code, 400)

        unknown = self.client.post(
            f"{self.lessons_url}reorder/",
            {"lesson_ids": [first.pk, 99999]},
            format="json",
        )
        self.assertEqual(unknown.status_code, 400)

        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual((first.order, second.order), (1, 2))

    def test_teacher_deletes_lesson_and_shifts_remaining_up(self):
        first = create_lesson(self.course, "Un", order=1)
        second = create_lesson(self.course, "Deux", order=2)
        third = create_lesson(self.course, "Trois", order=3)
        storage = second.file.storage
        second_name = second.file.name
        self.client.force_login(self.teacher)

        response = self.client.delete(self.lesson_url(second))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(storage.exists(second_name))
        first.refresh_from_db()
        third.refresh_from_db()
        self.assertEqual((first.order, third.order), (1, 2))

    def test_other_teacher_cannot_manage_lessons(self):
        lesson = create_lesson(self.course, "Un", order=1)
        self.client.force_login(self.other_teacher)

        create = self.client.post(
            self.lessons_url,
            {"title": "Intrus", "file": pdf_upload()},
            format="multipart",
        )
        self.assertEqual(create.status_code, 403)

        update = self.client.patch(
            self.lesson_url(lesson), {"title": "Modifié"}, format="json"
        )
        self.assertEqual(update.status_code, 403)

        delete = self.client.delete(self.lesson_url(lesson))
        self.assertEqual(delete.status_code, 403)

        reorder = self.client.post(
            f"{self.lessons_url}reorder/",
            {"lesson_ids": [lesson.pk]},
            format="json",
        )
        self.assertEqual(reorder.status_code, 403)

    # ------------------------------------------------------------- student

    def test_student_must_be_enrolled_to_list_lessons(self):
        create_lesson(self.course, "Un", order=1)
        self.client.force_login(self.student)

        response = self.client.get(self.lessons_url)

        self.assertEqual(response.status_code, 403)

    def test_student_sees_lock_statuses(self):
        first = create_lesson(self.course, "Un", order=1)
        second = create_lesson(self.course, "Deux", order=2)
        create_lesson(self.course, "Brouillon", order=3, is_published=False)
        self.enroll()
        self.client.force_login(self.student)

        response = self.client.get(self.lessons_url)

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)
        by_id = {item["id"]: item for item in data}
        self.assertFalse(by_id[first.pk]["is_locked"])
        self.assertFalse(by_id[first.pk]["is_completed"])
        self.assertTrue(by_id[second.pk]["is_locked"])

    def test_student_serves_unlocked_file_but_locked_file_is_403(self):
        first = create_lesson(self.course, "Un", order=1)
        second = create_lesson(self.course, "Deux", order=2)
        self.enroll()
        self.client.force_login(self.student)

        allowed = self.client.get(self.action_url(first, "file"))
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed["Content-Type"], "application/pdf")

        blocked = self.client.get(self.action_url(second, "file"))
        self.assertEqual(blocked.status_code, 403)

    def test_completing_first_lesson_unlocks_the_second(self):
        first = create_lesson(self.course, "Un", order=1)
        second = create_lesson(self.course, "Deux", order=2)
        third = create_lesson(self.course, "Trois", order=3)
        self.enroll()
        self.client.force_login(self.student)

        blocked = self.client.post(
            self.action_url(third, "complete"), {}, format="json"
        )
        self.assertEqual(blocked.status_code, 403)

        response = self.client.post(
            self.action_url(first, "complete"),
            {"time_spent_seconds": 45},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["is_completed"])
        self.assertEqual(data["next_lesson_id"], second.pk)
        self.assertFalse(data["course_completed"])
        self.assertEqual(data["course_progress"]["completed_lessons"], 1)
        self.assertEqual(
            data["course_progress"]["percentage"], round(100 / 3, 2)
        )

        listing = self.client.get(self.lessons_url).json()
        by_id = {item["id"]: item for item in listing}
        self.assertTrue(by_id[first.pk]["is_completed"])
        self.assertFalse(by_id[second.pk]["is_locked"])
        self.assertTrue(by_id[third.pk]["is_locked"])
        self.assertIsNotNone(by_id[first.pk]["completed_at"])

    def test_completion_is_idempotent_and_cannot_be_un_done(self):
        first = create_lesson(self.course, "Un", order=1)
        self.enroll()
        self.client.force_login(self.student)

        first_response = self.client.post(
            self.action_url(first, "complete"), {}, format="json"
        )
        second_response = self.client.post(
            self.action_url(first, "complete"), {}, format="json"
        )

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(
            LessonCompletion.objects.filter(
                lesson=first, student=self.student
            ).count(),
            1,
        )
        completion = LessonCompletion.objects.get(
            lesson=first, student=self.student
        )
        self.assertTrue(completion.completed)

    def test_completing_all_lessons_completes_the_enrollment(self):
        first = create_lesson(self.course, "Un", order=1)
        second = create_lesson(self.course, "Deux", order=2)
        enrollment = self.enroll()
        self.client.force_login(self.student)

        self.client.post(
            self.action_url(first, "complete"), {}, format="json"
        )
        response = self.client.post(
            self.action_url(second, "complete"), {}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["course_completed"])
        enrollment.refresh_from_db()
        self.assertTrue(enrollment.completed)
        self.assertIsNotNone(enrollment.completed_at)

        progress = self.client.get(
            f"/api/courses/{self.course.pk}/progress/"
        ).json()
        self.assertEqual(progress["progress"], 100)
        self.assertTrue(progress["completed"])

    def test_my_progress_summary(self):
        first = create_lesson(self.course, "Un", order=1)
        create_lesson(self.course, "Deux", order=2)
        create_lesson(self.course, "Trois", order=3)
        self.enroll()
        self.client.force_login(self.student)

        response = self.client.get(f"{self.lessons_url}my-progress/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total_lessons"], 3)
        self.assertEqual(data["completed_lessons"], 0)
        self.assertEqual(data["locked_lessons"], 2)
        self.assertEqual(data["percentage"], 0)

        self.client.post(
            self.action_url(first, "complete"), {}, format="json"
        )
        data = self.client.get(f"{self.lessons_url}my-progress/").json()
        self.assertEqual(data["completed_lessons"], 1)
        self.assertEqual(data["locked_lessons"], 1)
        self.assertEqual(
            data["percentage"], round(100 / 3, 2)
        )

    def test_teacher_and_admin_cannot_complete_lessons(self):
        lesson = create_lesson(self.course, "Un", order=1)
        self.enroll()
        self.client.force_login(self.teacher)
        response = self.client.post(
            self.action_url(lesson, "complete"), {}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_teacher_serves_any_lesson_file(self):
        first = create_lesson(self.course, "Un", order=1)
        second = create_lesson(self.course, "Deux", order=2)
        self.client.force_login(self.teacher)

        response = self.client.get(self.action_url(second, "file"))

        self.assertEqual(response.status_code, 200)
        self.assertTrue(first)

    def test_lesson_file_serves_range_requests(self):
        first = create_lesson(self.course, "Un", order=1)
        self.enroll()
        self.client.force_login(self.student)

        response = self.client.get(
            self.action_url(first, "file"), HTTP_RANGE="bytes=0-99"
        )
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response["Accept-Ranges"], "bytes")

    def test_unpublished_lesson_cannot_be_completed(self):
        lesson = create_lesson(self.course, "Brouillon", order=1, is_published=False)
        self.enroll()
        self.client.force_login(self.student)

        response = self.client.post(
            self.action_url(lesson, "complete"), {}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_requests_are_rejected(self):
        create_lesson(self.course, "Un", order=1)

        response = self.client.get(self.lessons_url)
        self.assertEqual(response.status_code, 401)

    # ------------------------------------------------------------- course

    def test_course_serializer_includes_lesson_metadata(self):
        first = create_lesson(self.course, "Un", order=1)
        second = create_lesson(self.course, "Deux", order=2)
        self.enroll()
        first.mark_completed(self.student)
        self.client.force_login(self.student)

        response = self.client.get(f"/api/courses/{self.course.pk}/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["lesson_count"], 2)
        self.assertEqual(data["completed_lessons"], 1)
        self.assertEqual(data["progress_percentage"], 50)
        self.assertEqual(len(data["lessons"]), 2)
        lesson_by_id = {item["id"]: item for item in data["lessons"]}
        self.assertTrue(lesson_by_id[first.pk]["is_completed"])
        self.assertFalse(lesson_by_id[first.pk]["is_locked"])
        # Completing the first lesson unlocks the second.
        self.assertFalse(lesson_by_id[second.pk]["is_locked"])
        self.assertFalse(lesson_by_id[second.pk]["is_completed"])

    def test_course_list_omits_lessons_but_counts_them(self):
        create_lesson(self.course, "Un", order=1)
        self.client.force_login(self.teacher)

        response = self.client.get("/api/courses/")

        data = response.json()["results"][0]
        self.assertEqual(data["lesson_count"], 1)
        self.assertEqual(data["lessons"], [])
