import uuid
from pathlib import Path

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from accounts.models import User

from .validators import (
    PDF_EXTENSIONS,
    VIDEO_EXTENSIONS,
    validate_course_file,
    validate_thumbnail,
)


def course_upload_path(instance, filename):
    extension = Path(filename).suffix.lower()
    return f"courses/{uuid.uuid4().hex}{extension}"


def course_thumbnail_path(instance, filename):
    extension = Path(filename).suffix.lower()
    return f"course_thumbnails/{uuid.uuid4().hex}{extension}"


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=120, unique=True, blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "category"
        verbose_name_plural = "categories"

    def _build_unique_slug(self):
        base = slugify(self.name)[:120] or "category"
        slug = base
        counter = 2
        while (
            Category.objects.filter(slug=slug)
            .exclude(pk=self.pk)
            .exists()
        ):
            suffix = f"-{counter}"
            slug = f"{base[: 120 - len(suffix)]}{suffix}"
            counter += 1
        return slug

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = self._build_unique_slug()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Course(models.Model):
    class Type(models.TextChoices):
        PDF = "pdf", "PDF"
        AUDIO = "audio", "Audio"
        VIDEO = "video", "Video"

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    type = models.CharField(max_length=10, choices=Type.choices, editable=False)
    file = models.FileField(
        upload_to=course_upload_path,
        validators=[validate_course_file],
        blank=True,
    )
    video_url = models.URLField(blank=True)
    thumbnail = models.ImageField(
        upload_to=course_thumbnail_path,
        validators=[validate_thumbnail],
        null=True,
        blank=True,
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="courses",
    )
    tags = models.CharField(max_length=500, blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="courses",
    )
    max_students = models.PositiveIntegerField(null=True, blank=True)
    enrolled_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "course"
        verbose_name_plural = "courses"
        indexes = [
            models.Index(fields=["type"]),
            models.Index(fields=["owner"]),
            models.Index(fields=["category"]),
        ]

    def save(self, *args, **kwargs):
        if self.file:
            extension = Path(self.file.name).suffix.lower().lstrip(".")
            if extension in VIDEO_EXTENSIONS:
                self.type = self.Type.VIDEO
            elif extension in PDF_EXTENSIONS:
                self.type = self.Type.PDF
            else:
                self.type = self.Type.AUDIO
        elif self.video_url:
            self.type = self.Type.VIDEO
        super().save(*args, **kwargs)

    @property
    def is_full(self):
        return (
            self.max_students is not None
            and self.enrolled_count >= self.max_students
        )

    def can_enroll(self, user):
        if not user or not user.is_authenticated:
            return False
        if user.role != User.Role.STUDENT:
            return False
        if self.is_full:
            return False
        return not self.enrollments.filter(student=user).exists()

    def __str__(self):
        return self.title


class Enrollment(models.Model):
    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name="enrollments",
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="course_enrollments",
        limit_choices_to={"role": User.Role.STUDENT},
    )
    enrolled_at = models.DateTimeField(auto_now_add=True)
    completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-enrolled_at"]
        verbose_name = "enrollment"
        verbose_name_plural = "enrollments"
        unique_together = [["course", "student"]]
        indexes = [
            models.Index(fields=["course"]),
            models.Index(fields=["student"]),
        ]

    def __str__(self):
        return f"{self.student} → {self.course}"


class CourseProgress(models.Model):
    enrollment = models.OneToOneField(
        Enrollment,
        on_delete=models.CASCADE,
        related_name="course_progress",
    )
    # Audio uses the duration fields too; PDF courses use the page fields.
    video_duration_seconds = models.PositiveIntegerField(default=0)
    video_watched_seconds = models.PositiveIntegerField(default=0)
    last_position_seconds = models.PositiveIntegerField(default=0)
    total_pages = models.PositiveIntegerField(default=0)
    pages_viewed = models.PositiveIntegerField(default=0)
    has_opened_material = models.BooleanField(default=False)
    first_viewed_at = models.DateTimeField(null=True, blank=True)
    last_viewed_at = models.DateTimeField(null=True, blank=True)
    completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "course progress"
        verbose_name_plural = "course progress"

    @property
    def percentage(self):
        if self.completed:
            return 100

        course = self.enrollment.course
        if course.type in {Course.Type.VIDEO, Course.Type.AUDIO}:
            if self.video_duration_seconds:
                watched = min(
                    self.video_watched_seconds,
                    self.video_duration_seconds,
                )
                return min(
                    100,
                    round(watched * 100 / self.video_duration_seconds, 2),
                )
            if course.video_url and not course.file:
                # External embeds expose no playback data, so opening them
                # counts as half progress.
                return 50 if self.has_opened_material else 0
            return 0

        if course.type == Course.Type.PDF:
            if not self.total_pages:
                return 0
            viewed = min(self.pages_viewed, self.total_pages)
            return min(100, round(viewed * 100 / self.total_pages, 2))

        return 50 if self.has_opened_material else 0

    def mark_completed(self):
        now = timezone.now()
        self.completed = True
        self.completed_at = now
        self.save(update_fields=["completed", "completed_at"])

        self.enrollment.completed = True
        self.enrollment.completed_at = now
        self.enrollment.save(update_fields=["completed", "completed_at"])

    def __str__(self):
        return f"{self.enrollment} ({self.percentage}%)"


class CourseTranscript(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    class Stage(models.TextChoices):
        QUEUED = "queued", "Queued"
        EXTRACTING = "extracting_audio", "Extracting audio"
        TRANSCRIBING = "transcribing", "Transcribing audio"
        FORMATTING = "formatting", "Formatting transcript"
        DONE = "done", "Complete"
        FAILED = "failed", "Failed"

    course = models.OneToOneField(
        Course,
        on_delete=models.CASCADE,
        related_name="transcript",
    )
    status = models.CharField(
        max_length=12,
        choices=Status.choices,
        default=Status.QUEUED,
    )
    stage = models.CharField(
        max_length=20,
        choices=Stage.choices,
        default=Stage.QUEUED,
    )
    progress = models.PositiveSmallIntegerField(default=0)
    language = models.CharField(max_length=10, default="en")
    model_name = models.CharField(max_length=80, blank=True)
    text = models.TextField(blank=True)
    formatted_by_ai = models.BooleanField(default=False)
    segment_count = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requested_transcripts",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "course transcript"
        verbose_name_plural = "course transcripts"

    def __str__(self):
        return f"Transcript for {self.course} ({self.status})"
