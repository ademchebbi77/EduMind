import subprocess
import tempfile
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import imageio_ffmpeg
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from courses import transcripts
from courses.demo_files import build_wav
from courses.models import Course, CourseTranscript, Enrollment

from .utils import (
    MP4_BYTES,
    TemporaryMediaMixin,
    create_course,
    mp4_upload,
)


def transcript_url(course):
    return f"/api/courses/{course.pk}/transcript/"


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
    COHERE_API_KEY="test-key",
)
class TranscriptApiTests(TemporaryMediaMixin, APITestCase):
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
            last_name="Teacher",
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
        self.course = create_course(
            self.teacher,
            title="Video lesson",
            filename="lesson.mp4",
            content=MP4_BYTES,
        )
        Enrollment.objects.create(course=self.course, student=self.student)

    def test_get_returns_not_generated_state(self):
        self.client.force_login(self.student)

        response = self.client.get(transcript_url(self.course))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["status"], "none")
        self.assertEqual(data["text"], "")
        self.assertEqual(data["progress"], 0)

    def test_owner_starts_generation(self):
        self.client.force_login(self.teacher)

        with patch("courses.views.enqueue_transcript") as enqueue:
            response = self.client.post(
                transcript_url(self.course),
                {"language": "fr"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        data = response.json()
        self.assertEqual(data["status"], "queued")
        self.assertEqual(data["language"], "fr")
        self.assertEqual(data["progress"], 0)

        row = CourseTranscript.objects.get(course=self.course)
        self.assertEqual(row.requested_by, self.teacher)
        self.assertEqual(row.language, "fr")
        enqueue.assert_called_once_with(row.pk)

    def test_enrolled_student_can_start_generation(self):
        self.client.force_login(self.student)

        with patch("courses.views.enqueue_transcript") as enqueue:
            response = self.client.post(transcript_url(self.course), format="json")

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        enqueue.assert_called_once()

    def test_unenrolled_student_cannot_start_generation(self):
        self.client.force_login(self.other_student)

        with patch("courses.views.enqueue_transcript") as enqueue:
            response = self.client.post(transcript_url(self.course), format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(CourseTranscript.objects.exists())
        enqueue.assert_not_called()

    def test_non_owner_teacher_cannot_start_generation(self):
        self.client.force_login(self.other_teacher)

        with patch("courses.views.enqueue_transcript") as enqueue:
            response = self.client.post(transcript_url(self.course), format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        enqueue.assert_not_called()

    def test_admin_can_start_generation(self):
        self.client.force_login(self.admin)

        with patch("courses.views.enqueue_transcript") as enqueue:
            response = self.client.post(transcript_url(self.course), format="json")

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        enqueue.assert_called_once()

    def test_non_video_course_is_rejected(self):
        pdf_course = create_course(self.teacher, title="Document")
        self.client.force_login(self.teacher)

        response = self.client.post(transcript_url(pdf_course), format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("course", response.json()["error"]["fields"])

    def test_external_video_is_rejected(self):
        course = Course.objects.create(
            title="External video",
            owner=self.teacher,
            video_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        )
        self.client.force_login(self.teacher)

        response = self.client.post(transcript_url(course), format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(COHERE_API_KEY="")
    def test_missing_api_key_returns_service_unavailable(self):
        self.client.force_login(self.teacher)

        with patch("courses.views.enqueue_transcript") as enqueue:
            response = self.client.post(transcript_url(self.course), format="json")

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(
            response.data["error"]["message"],
            "Transcript generation is not configured on this server.",
        )
        self.assertFalse(CourseTranscript.objects.exists())
        enqueue.assert_not_called()

    def test_invalid_language_is_rejected(self):
        self.client.force_login(self.teacher)

        response = self.client.post(
            transcript_url(self.course),
            {"language": "xx"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CourseTranscript.objects.exists())

    def test_completed_transcript_is_returned_without_requeue(self):
        CourseTranscript.objects.create(
            course=self.course,
            status=CourseTranscript.Status.COMPLETED,
            stage=CourseTranscript.Stage.DONE,
            progress=100,
            text="[00:00] Already generated.",
            formatted_by_ai=True,
        )
        self.client.force_login(self.teacher)

        with patch("courses.views.enqueue_transcript") as enqueue:
            response = self.client.post(transcript_url(self.course), format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json()["text"], "[00:00] Already generated."
        )
        enqueue.assert_not_called()

    def test_processing_transcript_is_idempotent(self):
        CourseTranscript.objects.create(
            course=self.course,
            status=CourseTranscript.Status.PROCESSING,
            stage=CourseTranscript.Stage.TRANSCRIBING,
            progress=40,
        )
        self.client.force_login(self.student)

        with patch("courses.views.enqueue_transcript") as enqueue:
            response = self.client.post(transcript_url(self.course), format="json")

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.json()["progress"], 40)
        enqueue.assert_not_called()

    def test_failed_transcript_can_be_retried(self):
        row = CourseTranscript.objects.create(
            course=self.course,
            status=CourseTranscript.Status.FAILED,
            stage=CourseTranscript.Stage.FAILED,
            error_message="Previous failure.",
        )
        self.client.force_login(self.teacher)

        with patch("courses.views.enqueue_transcript") as enqueue:
            response = self.client.post(
                transcript_url(self.course),
                {"language": "es"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        row.refresh_from_db()
        self.assertEqual(row.status, CourseTranscript.Status.QUEUED)
        self.assertEqual(row.language, "es")
        self.assertEqual(row.error_message, "")
        enqueue.assert_called_once_with(row.pk)

    def test_get_returns_completed_transcript_to_students(self):
        CourseTranscript.objects.create(
            course=self.course,
            status=CourseTranscript.Status.COMPLETED,
            stage=CourseTranscript.Stage.DONE,
            progress=100,
            text="[00:00] Welcome.",
            formatted_by_ai=True,
        )
        self.client.force_login(self.student)

        response = self.client.get(transcript_url(self.course))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["status"], "completed")
        self.assertEqual(response.json()["text"], "[00:00] Welcome.")

    def _make_stale_transcript(self):
        row = CourseTranscript.objects.create(
            course=self.course,
            status=CourseTranscript.Status.PROCESSING,
            stage=CourseTranscript.Stage.TRANSCRIBING,
            progress=40,
            started_at=timezone.now() - timedelta(hours=1),
        )
        CourseTranscript.objects.filter(pk=row.pk).update(
            updated_at=timezone.now() - timedelta(hours=1)
        )
        row.refresh_from_db()
        return row

    def test_stale_transcript_is_marked_failed_on_get(self):
        row = self._make_stale_transcript()
        self.client.force_login(self.student)

        response = self.client.get(transcript_url(self.course))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["status"], "failed")
        self.assertIn("interrupted", response.json()["error_message"])
        row.refresh_from_db()
        self.assertEqual(row.status, CourseTranscript.Status.FAILED)

    def test_stale_transcript_can_be_restarted(self):
        row = self._make_stale_transcript()
        self.client.force_login(self.teacher)

        with patch("courses.views.enqueue_transcript") as enqueue:
            response = self.client.post(transcript_url(self.course), format="json")

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        enqueue.assert_called_once_with(row.pk)
        row.refresh_from_db()
        self.assertEqual(row.status, CourseTranscript.Status.QUEUED)

    def test_replacing_the_video_removes_the_stale_transcript(self):
        CourseTranscript.objects.create(
            course=self.course,
            status=CourseTranscript.Status.COMPLETED,
            stage=CourseTranscript.Stage.DONE,
            progress=100,
            text="[00:00] Old transcript.",
        )
        self.client.force_login(self.teacher)

        response = self.client.patch(
            f"/api/courses/{self.course.pk}/",
            {"file": mp4_upload("replacement.mp4")},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(
            CourseTranscript.objects.filter(course=self.course).exists()
        )


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
    COHERE_API_KEY="test-key",
    COHERE_TRANSCRIBE_MODEL="test-transcribe",
    COHERE_CHAT_MODEL="test-chat",
    COHERE_TRANSCRIPT_SECTION_CHARS=12000,
    TRANSCRIPT_CHUNK_SECONDS=120,
    TRANSCRIPT_FFMPEG_TIMEOUT_SECONDS=60,
)
class TranscriptServiceTests(TemporaryMediaMixin, TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            email="owner@example.com",
            password="StrongPass123!",
            first_name="Owner",
            last_name="Teacher",
            role=User.Role.TEACHER,
        )
        self.course = create_course(
            self.teacher,
            title="Video lesson",
            filename="lesson.mp4",
            content=MP4_BYTES,
        )
        self.transcript = CourseTranscript.objects.create(
            course=self.course,
            language="en",
            model_name="test-transcribe",
        )

    def test_generate_transcript_completes_with_timestamps(self):
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
            transcripts.generate_transcript(self.transcript.pk)

        self.transcript.refresh_from_db()
        self.assertEqual(
            self.transcript.status, CourseTranscript.Status.COMPLETED
        )
        self.assertEqual(
            self.transcript.stage, CourseTranscript.Stage.DONE
        )
        self.assertEqual(self.transcript.progress, 100)
        self.assertEqual(self.transcript.segment_count, 2)
        self.assertTrue(self.transcript.formatted_by_ai)
        self.assertIn("[00:00]", self.transcript.text)
        self.assertIn("[02:00]", self.transcript.text)
        self.assertIsNotNone(self.transcript.completed_at)

    def test_extraction_failure_marks_the_transcript_failed(self):
        with (
            patch.object(transcripts, "_get_client", return_value=object()),
            patch.object(
                transcripts,
                "_extract_audio_chunks",
                side_effect=transcripts.TranscriptGenerationError(
                    "This video has no audio track."
                ),
            ),
        ):
            transcripts.generate_transcript(self.transcript.pk)

        self.transcript.refresh_from_db()
        self.assertEqual(
            self.transcript.status, CourseTranscript.Status.FAILED
        )
        self.assertEqual(
            self.transcript.stage, CourseTranscript.Stage.FAILED
        )
        self.assertEqual(
            self.transcript.error_message, "This video has no audio track."
        )

    @override_settings(COHERE_API_KEY="")
    def test_missing_configuration_marks_the_transcript_failed(self):
        transcripts.generate_transcript(self.transcript.pk)

        self.transcript.refresh_from_db()
        self.assertEqual(
            self.transcript.status, CourseTranscript.Status.FAILED
        )
        self.assertIn("not configured", self.transcript.error_message)

    def test_formatting_failure_keeps_the_raw_transcript(self):
        raw = "[00:00] Bonjour.\n[02:00] Deuxieme partie."

        with patch.object(
            transcripts, "_format_section", side_effect=RuntimeError("boom")
        ):
            with self.assertLogs("courses.transcripts", level="ERROR"):
                text, used_ai = transcripts._format_transcript(
                    object(), raw, "test-chat"
                )

        self.assertEqual(text, raw)
        self.assertFalse(used_ai)

    def test_formatting_without_timestamps_falls_back_to_raw_text(self):
        raw = "[00:00] Bonjour.\n[02:00] Deuxieme partie."

        with patch.object(
            transcripts, "_format_section", return_value="Bonjour. Deuxieme partie."
        ):
            with self.assertLogs("courses.transcripts", level="ERROR"):
                text, used_ai = transcripts._format_transcript(
                    object(), raw, "test-chat"
                )

        self.assertEqual(text, raw)
        self.assertFalse(used_ai)

    def test_split_sections_keeps_each_section_bounded(self):
        raw = "[00:00] one\n[02:00] two\n[04:00] three\n[06:00] four\n"

        sections = transcripts._split_sections(raw, 24)

        self.assertGreaterEqual(len(sections), 2)
        self.assertEqual("".join(sections).replace("\n", ""), raw.replace("\n", ""))
        self.assertTrue(all(len(section) <= 30 for section in sections))

    def test_format_timestamp(self):
        self.assertEqual(transcripts.format_timestamp(0), "00:00")
        self.assertEqual(transcripts.format_timestamp(65), "01:05")
        self.assertEqual(transcripts.format_timestamp(3725), "1:02:05")

    def test_extracts_audio_chunks_from_a_real_video(self):
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

        with tempfile.TemporaryDirectory() as temporary:
            workdir = Path(temporary)
            wav_path = workdir / "tone.wav"
            video_path = workdir / "tone.mp4"
            wav_path.write_bytes(build_wav(seconds=2.5))

            subprocess.run(
                [
                    ffmpeg,
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=c=black:s=160x120:r=10:d=2.5",
                    "-i",
                    str(wav_path),
                    "-shortest",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "ultrafast",
                    "-c:a",
                    "aac",
                    str(video_path),
                ],
                check=True,
                capture_output=True,
                timeout=60,
            )

            chunks = transcripts._extract_audio_chunks(video_path, workdir, 1)

            self.assertGreaterEqual(len(chunks), 2)
            self.assertTrue(
                all(
                    chunk.exists() and chunk.stat().st_size > 0
                    for chunk in chunks
                )
            )
