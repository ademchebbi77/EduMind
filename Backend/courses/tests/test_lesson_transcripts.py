from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from django.db.models import Max
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from courses import transcripts
from courses.models import (
    Enrollment,
    Lesson,
    LessonTranscript,
)

from .utils import (
    TemporaryMediaMixin,
    create_course,
    mp4_upload,
    pdf_upload,
    wav_upload,
)


def lesson_transcript_url(course, lesson):
    return f"/api/courses/{course.pk}/lessons/{lesson.pk}/transcript/"


def make_lesson(course, title, filename="clip.mp4", video_url=""):
    order = (course.lessons.aggregate(max_order=Max("order"))["max_order"] or 0) + 1
    if filename is None:
        upload = None
    elif filename.endswith(".pdf"):
        upload = pdf_upload(name=filename)
    elif filename.endswith(".mp4"):
        upload = mp4_upload(name=filename)
    else:
        upload = wav_upload(name=filename)
    lesson = Lesson(
        course=course,
        title=title,
        order=order,
        file=upload,
        video_url=video_url,
    )
    lesson.save()
    return lesson


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
    COHERE_API_KEY="test-key",
)
class LessonTranscriptApiTests(TemporaryMediaMixin, APITestCase):
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
        self.other_student = User.objects.create_user(
            email="student2@example.com",
            password=self.password,
            role=User.Role.STUDENT,
        )
        self.course = create_course(self.teacher, title="Video course")
        self.lesson = make_lesson(self.course, "Video lesson", "clip.mp4")
        self.audio_lesson = make_lesson(self.course, "Audio lesson", "clip.wav")
        self.pdf_lesson = make_lesson(self.course, "Document lesson", "notes.pdf")
        Enrollment.objects.create(course=self.course, student=self.student)

    def test_get_returns_not_generated_state(self):
        self.client.force_login(self.student)

        response = self.client.get(
            lesson_transcript_url(self.course, self.lesson)
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["status"], "none")
        self.assertEqual(data["text"], "")
        self.assertEqual(data["progress"], 0)

    def test_anonymous_user_cannot_read_the_transcript(self):
        response = self.client.get(
            lesson_transcript_url(self.course, self.lesson)
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unenrolled_student_cannot_read_or_generate(self):
        self.client.force_login(self.other_student)

        with patch("courses.views.enqueue_lesson_transcript") as enqueue:
            read = self.client.get(
                lesson_transcript_url(self.course, self.lesson)
            )
            write = self.client.post(
                lesson_transcript_url(self.course, self.lesson),
                format="json",
            )

        self.assertEqual(read.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(write.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(LessonTranscript.objects.exists())
        enqueue.assert_not_called()

    def test_non_owner_teacher_cannot_generate(self):
        self.client.force_login(self.other_teacher)

        with patch("courses.views.enqueue_lesson_transcript") as enqueue:
            response = self.client.post(
                lesson_transcript_url(self.course, self.lesson),
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        enqueue.assert_not_called()

    def test_owner_starts_generation(self):
        self.client.force_login(self.teacher)

        with patch("courses.views.enqueue_lesson_transcript") as enqueue:
            response = self.client.post(
                lesson_transcript_url(self.course, self.lesson),
                {"language": "fr"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        data = response.json()
        self.assertEqual(data["status"], "queued")
        self.assertEqual(data["language"], "fr")

        row = LessonTranscript.objects.get(lesson=self.lesson)
        self.assertEqual(row.requested_by, self.teacher)
        self.assertEqual(row.language, "fr")
        enqueue.assert_called_once_with(row.pk)

    def test_enrolled_student_can_start_generation(self):
        self.client.force_login(self.student)

        with patch("courses.views.enqueue_lesson_transcript") as enqueue:
            response = self.client.post(
                lesson_transcript_url(self.course, self.lesson),
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        enqueue.assert_called_once()

    def test_admin_can_start_generation(self):
        self.client.force_login(self.admin)

        with patch("courses.views.enqueue_lesson_transcript") as enqueue:
            response = self.client.post(
                lesson_transcript_url(self.course, self.lesson),
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        enqueue.assert_called_once()

    def test_audio_lessons_are_supported(self):
        self.client.force_login(self.teacher)

        with patch("courses.views.enqueue_lesson_transcript"):
            response = self.client.post(
                lesson_transcript_url(self.course, self.audio_lesson),
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)

    def test_pdf_lessons_are_rejected(self):
        self.client.force_login(self.teacher)

        response = self.client.post(
            lesson_transcript_url(self.course, self.pdf_lesson),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("lesson", response.json()["error"]["fields"])

    def test_external_video_lessons_are_rejected(self):
        lesson = make_lesson(
            self.course,
            "YouTube lesson",
            filename=None,
            video_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        )
        self.client.force_login(self.teacher)

        response = self.client.post(
            lesson_transcript_url(self.course, lesson), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(COHERE_API_KEY="")
    def test_missing_api_key_returns_service_unavailable(self):
        self.client.force_login(self.teacher)

        with patch("courses.views.enqueue_lesson_transcript") as enqueue:
            response = self.client.post(
                lesson_transcript_url(self.course, self.lesson),
                format="json",
            )

        self.assertEqual(
            response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE
        )
        self.assertFalse(LessonTranscript.objects.exists())
        enqueue.assert_not_called()

    def test_invalid_language_is_rejected(self):
        self.client.force_login(self.teacher)

        response = self.client.post(
            lesson_transcript_url(self.course, self.lesson),
            {"language": "xx"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(LessonTranscript.objects.exists())

    def test_locked_lesson_is_denied_to_students(self):
        make_lesson(self.course, "First", "first.pdf")
        locked = make_lesson(self.course, "Locked video", "locked.mp4")
        self.client.force_login(self.student)

        with patch("courses.views.enqueue_lesson_transcript") as enqueue:
            read = self.client.get(lesson_transcript_url(self.course, locked))
            write = self.client.post(
                lesson_transcript_url(self.course, locked), format="json"
            )

        self.assertEqual(read.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(write.status_code, status.HTTP_403_FORBIDDEN)
        enqueue.assert_not_called()

    def test_completed_transcript_is_returned_without_requeue(self):
        LessonTranscript.objects.create(
            lesson=self.lesson,
            status=LessonTranscript.Status.COMPLETED,
            stage=LessonTranscript.Stage.DONE,
            progress=100,
            language="en",
            text="[00:00] Already generated.",
            formatted_by_ai=True,
        )
        self.client.force_login(self.student)

        with patch("courses.views.enqueue_lesson_transcript") as enqueue:
            response = self.client.get(
                lesson_transcript_url(self.course, self.lesson)
            )
            post = self.client.post(
                lesson_transcript_url(self.course, self.lesson),
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json()["text"], "[00:00] Already generated."
        )
        self.assertEqual(post.status_code, status.HTTP_200_OK)
        enqueue.assert_not_called()

    def test_different_language_regenerates_the_transcript(self):
        row = LessonTranscript.objects.create(
            lesson=self.lesson,
            status=LessonTranscript.Status.COMPLETED,
            stage=LessonTranscript.Stage.DONE,
            progress=100,
            language="en",
            text="[00:00] English text.",
        )
        self.client.force_login(self.teacher)

        with patch("courses.views.enqueue_lesson_transcript") as enqueue:
            response = self.client.post(
                lesson_transcript_url(self.course, self.lesson),
                {"language": "fr"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        row.refresh_from_db()
        self.assertEqual(row.status, LessonTranscript.Status.QUEUED)
        self.assertEqual(row.language, "fr")
        self.assertEqual(row.text, "")
        enqueue.assert_called_once_with(row.pk)

    def test_regenerate_flag_requeues_the_same_language(self):
        row = LessonTranscript.objects.create(
            lesson=self.lesson,
            status=LessonTranscript.Status.COMPLETED,
            stage=LessonTranscript.Stage.DONE,
            progress=100,
            language="en",
            text="[00:00] English text.",
        )
        self.client.force_login(self.student)

        with patch("courses.views.enqueue_lesson_transcript") as enqueue:
            response = self.client.post(
                lesson_transcript_url(self.course, self.lesson),
                {"language": "en", "regenerate": True},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        row.refresh_from_db()
        self.assertEqual(row.status, LessonTranscript.Status.QUEUED)
        enqueue.assert_called_once_with(row.pk)

    def test_processing_transcript_is_idempotent(self):
        LessonTranscript.objects.create(
            lesson=self.lesson,
            status=LessonTranscript.Status.PROCESSING,
            stage=LessonTranscript.Stage.TRANSCRIBING,
            progress=40,
        )
        self.client.force_login(self.student)

        with patch("courses.views.enqueue_lesson_transcript") as enqueue:
            response = self.client.post(
                lesson_transcript_url(self.course, self.lesson),
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.json()["progress"], 40)
        enqueue.assert_not_called()

    def test_failed_transcript_can_be_retried(self):
        row = LessonTranscript.objects.create(
            lesson=self.lesson,
            status=LessonTranscript.Status.FAILED,
            stage=LessonTranscript.Stage.FAILED,
            error_message="Previous failure.",
        )
        self.client.force_login(self.teacher)

        with patch("courses.views.enqueue_lesson_transcript") as enqueue:
            response = self.client.post(
                lesson_transcript_url(self.course, self.lesson),
                {"language": "es"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        row.refresh_from_db()
        self.assertEqual(row.status, LessonTranscript.Status.QUEUED)
        self.assertEqual(row.language, "es")
        self.assertEqual(row.error_message, "")
        enqueue.assert_called_once_with(row.pk)

    def test_stale_transcript_is_marked_failed_on_get(self):
        row = LessonTranscript.objects.create(
            lesson=self.lesson,
            status=LessonTranscript.Status.PROCESSING,
            stage=LessonTranscript.Stage.TRANSCRIBING,
            progress=40,
        )
        LessonTranscript.objects.filter(pk=row.pk).update(
            updated_at=timezone.now() - timedelta(hours=1)
        )
        self.client.force_login(self.student)

        response = self.client.get(
            lesson_transcript_url(self.course, self.lesson)
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["status"], "failed")
        self.assertIn("interrupted", response.json()["error_message"])

    def test_replacing_the_lesson_file_removes_the_transcript(self):
        LessonTranscript.objects.create(
            lesson=self.lesson,
            status=LessonTranscript.Status.COMPLETED,
            stage=LessonTranscript.Stage.DONE,
            progress=100,
            text="[00:00] Old transcript.",
        )
        self.client.force_login(self.teacher)

        response = self.client.patch(
            f"/api/courses/{self.course.pk}/lessons/{self.lesson.pk}/",
            {"file": mp4_upload("replacement.mp4")},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(
            LessonTranscript.objects.filter(lesson=self.lesson).exists()
        )

    def test_deleting_a_lesson_removes_its_transcript(self):
        LessonTranscript.objects.create(lesson=self.lesson)
        self.client.force_login(self.teacher)

        response = self.client.delete(
            f"/api/courses/{self.course.pk}/lessons/{self.lesson.pk}/"
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(LessonTranscript.objects.exists())


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
    COHERE_API_KEY="test-key",
    COHERE_TRANSCRIBE_MODEL="test-transcribe",
    COHERE_CHAT_MODEL="test-chat",
    COHERE_TRANSCRIPT_SECTION_CHARS=12000,
    TRANSCRIPT_CHUNK_SECONDS=120,
    TRANSCRIPT_FFMPEG_TIMEOUT_SECONDS=60,
)
class LessonTranscriptServiceTests(TemporaryMediaMixin, TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            email="owner@example.com",
            password="StrongPass123!",
            role=User.Role.TEACHER,
        )
        self.course = create_course(self.teacher, title="Video course")
        self.lesson = make_lesson(self.course, "Video lesson", "clip.mp4")
        self.transcript = LessonTranscript.objects.create(
            lesson=self.lesson,
            language="en",
            model_name="test-transcribe",
        )

    def test_generate_lesson_transcript_completes_with_timestamps(self):
        chunks = [Path("chunk_0000.mp3"), Path("chunk_0001.mp3")]

        def fake_transcribe(client, chunk_path, language, model):
            if chunk_path.name == "chunk_0000.mp3":
                return "Welcome to the lesson."
            return "Here is the second part."

        with (
            patch.object(transcripts, "_get_client", return_value=object()),
            patch.object(
                transcripts, "_extract_audio_chunks", return_value=chunks
            ),
            patch.object(
                transcripts, "_transcribe_chunk", side_effect=fake_transcribe
            ),
            patch.object(
                transcripts,
                "_format_transcript",
                return_value=(
                    "[00:00] Welcome to the lesson.\n\n"
                    "[02:00] Here is the second part.",
                    True,
                ),
            ),
        ):
            transcripts.generate_lesson_transcript(self.transcript.pk)

        self.transcript.refresh_from_db()
        self.assertEqual(
            self.transcript.status, LessonTranscript.Status.COMPLETED
        )
        self.assertEqual(self.transcript.progress, 100)
        self.assertEqual(self.transcript.segment_count, 2)
        self.assertTrue(self.transcript.formatted_by_ai)
        self.assertIn("[00:00]", self.transcript.text)
        self.assertIsNotNone(self.transcript.completed_at)

    def test_missing_speech_marks_the_transcript_failed(self):
        with (
            patch.object(transcripts, "_get_client", return_value=object()),
            patch.object(
                transcripts,
                "_extract_audio_chunks",
                return_value=[Path("chunk_0000.mp3")],
            ),
            patch.object(
                transcripts, "_transcribe_chunk", return_value=""
            ),
        ):
            transcripts.generate_lesson_transcript(self.transcript.pk)

        self.transcript.refresh_from_db()
        self.assertEqual(
            self.transcript.status, LessonTranscript.Status.FAILED
        )
        self.assertEqual(
            self.transcript.error_message,
            "No speech was detected in this recording.",
        )

    def test_missing_lesson_file_marks_the_transcript_failed(self):
        self.lesson.file.delete(save=True)

        with patch.object(transcripts, "_get_client", return_value=object()):
            transcripts.generate_lesson_transcript(self.transcript.pk)

        self.transcript.refresh_from_db()
        self.assertEqual(
            self.transcript.status, LessonTranscript.Status.FAILED
        )
        self.assertEqual(
            self.transcript.error_message,
            "The lesson file could not be found.",
        )

    def test_missing_configuration_marks_the_transcript_failed(self):
        with override_settings(COHERE_API_KEY=""):
            transcripts.generate_lesson_transcript(self.transcript.pk)

        self.transcript.refresh_from_db()
        self.assertEqual(
            self.transcript.status, LessonTranscript.Status.FAILED
        )
        self.assertIn("not configured", self.transcript.error_message)
