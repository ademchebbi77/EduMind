import uuid
from pathlib import Path

from django.conf import settings
from django.db import models

from courses.models import Course


def voice_audio_path(instance, filename):
    extension = Path(filename).suffix.lower()
    return f"voice-questions/{uuid.uuid4().hex}{extension}"


class VoiceQuestion(models.Model):
    """A student's spoken question about a course and the AI answer to it."""

    class Status(models.TextChoices):
        TRANSCRIBING = "transcribing", "Transcribing"
        TRANSCRIBED = "transcribed", "Transcribed"
        ANSWERING = "answering", "Answering"
        ANSWERED = "answered", "Answered"
        FAILED = "failed", "Failed"

    class Stage(models.TextChoices):
        TRANSCRIPTION = "transcription", "Transcription"
        ANSWER = "answer", "Answer"

    class Language(models.TextChoices):
        AUTO = "auto", "Automatic"
        FRENCH = "fr", "French"
        ENGLISH = "en", "English"
        ARABIC = "ar", "Arabic"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="voice_questions",
    )
    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name="voice_questions",
    )
    audio = models.FileField(upload_to=voice_audio_path)
    audio_name = models.CharField(max_length=255)
    audio_content_type = models.CharField(max_length=100, blank=True)
    language_hint = models.CharField(
        max_length=5, choices=Language.choices, default=Language.AUTO
    )

    # Whisper output, then the (possibly edited) question actually asked.
    transcript = models.TextField(blank=True)
    detected_language = models.CharField(max_length=10, blank=True)
    question_text = models.TextField(blank=True)
    answer = models.TextField(blank=True)
    answer_language = models.CharField(max_length=10, blank=True)
    context_source = models.CharField(max_length=40, blank=True)

    status = models.CharField(max_length=15, choices=Status.choices, default=Status.TRANSCRIBING)
    failed_stage = models.CharField(max_length=15, choices=Stage.choices, blank=True)
    error_message = models.TextField(blank=True)

    transcription_model = models.CharField(max_length=80, blank=True)
    answer_model = models.CharField(max_length=80, blank=True)
    transcription_ms = models.PositiveIntegerField(null=True, blank=True)
    answer_ms = models.PositiveIntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    answered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "voice question"
        verbose_name_plural = "voice questions"
        indexes = [models.Index(fields=["student", "-created_at"])]

    def __str__(self):
        return (self.question_text or self.transcript or self.audio_name)[:80]

    @property
    def is_busy(self):
        return self.status in {self.Status.TRANSCRIBING, self.Status.ANSWERING}


class CourseComment(models.Model):
    """A student's comment on a course, with an optional reply from the course teacher."""

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="course_comments",
    )
    text = models.TextField()
    edited_at = models.DateTimeField(null=True, blank=True)

    reply = models.TextField(blank=True)
    replied_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="course_comment_replies",
    )
    replied_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "course comment"
        verbose_name_plural = "course comments"
        indexes = [models.Index(fields=["course", "-created_at"])]

    def __str__(self):
        return self.text[:80]
