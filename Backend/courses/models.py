import uuid
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
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


def lesson_upload_path(instance, filename):
    extension = Path(filename).suffix.lower()
    return f"course_lessons/{uuid.uuid4().hex}{extension}"


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

    class Difficulty(models.TextChoices):
        BEGINNER = "beginner", "Beginner"
        INTERMEDIATE = "intermediate", "Intermediate"
        ADVANCED = "advanced", "Advanced"

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
    difficulty = models.CharField(
        max_length=12,
        choices=Difficulty.choices,
        blank=True,
        default="",
    )
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

    def lesson_progress_for(self, student):
        """Summarise sequential lesson progress for one student.

        A lesson is unlocked when every published lesson before it has been
        completed; completed lessons stay accessible even after a reorder.
        """
        lessons = list(
            self.lessons.filter(is_published=True).order_by("order")
        )
        total = len(lessons)
        if total == 0:
            return {
                "total_lessons": 0,
                "completed_lessons": 0,
                "locked_lessons": 0,
                "percentage": 0,
                "statuses": {},
            }

        completions = LessonCompletion.objects.filter(
            lesson__course=self, student=student, completed=True
        ).values_list("lesson_id", "completed_at")
        completed_at_by_id = dict(completions)
        completed_ids = set(completed_at_by_id)

        statuses = {}
        previous_completed = True
        completed_count = 0
        locked_count = 0
        for lesson in lessons:
            is_completed = lesson.id in completed_ids
            is_locked = not previous_completed and not is_completed
            statuses[lesson.id] = {
                "is_locked": is_locked,
                "is_completed": is_completed,
                "completed_at": completed_at_by_id.get(lesson.id),
            }
            previous_completed = is_completed
            completed_count += 1 if is_completed else 0
            locked_count += 1 if is_locked else 0

        return {
            "total_lessons": total,
            "completed_lessons": completed_count,
            "locked_lessons": locked_count,
            "percentage": round(completed_count * 100 / total, 2),
            "statuses": statuses,
        }

    def sync_type_from_lessons(self):
        """Reflect the first lesson's format in the course type badge."""
        first_type = (
            self.lessons.order_by("order")
            .values_list("file_type", flat=True)
            .first()
        )
        if first_type and first_type != self.type:
            Course.objects.filter(pk=self.pk).update(type=first_type)
            self.type = first_type
        return self.type

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


class Lesson(models.Model):
    class FileType(models.TextChoices):
        PDF = "pdf", "PDF"
        AUDIO = "audio", "Audio"
        VIDEO = "video", "Video"

    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name="lessons",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField()
    file = models.FileField(
        upload_to=lesson_upload_path,
        validators=[validate_course_file],
        blank=True,
    )
    video_url = models.URLField(max_length=500, blank=True)
    file_type = models.CharField(
        max_length=10,
        choices=FileType.choices,
        editable=False,
    )
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    is_published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order"]
        verbose_name = "lesson"
        verbose_name_plural = "lessons"
        unique_together = [["course", "order"]]
        indexes = [
            models.Index(fields=["course", "order"]),
        ]

    def clean(self):
        super().clean()
        if not self.file and not self.video_url:
            raise ValidationError(
                "Provide a lesson file or a YouTube/Vimeo link."
            )

    def save(self, *args, **kwargs):
        if self.file:
            extension = Path(self.file.name).suffix.lower().lstrip(".")
            if extension in VIDEO_EXTENSIONS:
                self.file_type = self.FileType.VIDEO
            elif extension in PDF_EXTENSIONS:
                self.file_type = self.FileType.PDF
            else:
                self.file_type = self.FileType.AUDIO
        elif self.video_url:
            self.file_type = self.FileType.VIDEO
        super().save(*args, **kwargs)

        # A lesson-based course borrows the type of its first lesson so the
        # catalogue keeps a meaningful format badge.
        course = self.course
        if course is not None:
            course.sync_type_from_lessons()

    def previous_published(self):
        previous = (
            self.course.lessons.filter(
                is_published=True, order__lt=self.order
            )
            .order_by("-order")
            .first()
        )
        return previous

    def is_locked_for(self, student):
        """A lesson is locked unless it is completed or everything before it is."""
        if LessonCompletion.objects.filter(
            lesson=self, student=student, completed=True
        ).exists():
            return False
        previous = self.previous_published()
        if previous is None:
            return False
        return not LessonCompletion.objects.filter(
            lesson=previous, student=student, completed=True
        ).exists()

    def mark_completed(self, student):
        completion, _ = LessonCompletion.objects.get_or_create(
            lesson=self, student=student
        )
        if not completion.completed:
            completion.completed = True
            completion.completed_at = timezone.now()
            completion.save(update_fields=["completed", "completed_at"])
        return completion

    def __str__(self):
        return f"{self.course.title} — {self.order}. {self.title}"


class LessonCompletion(models.Model):
    lesson = models.ForeignKey(
        Lesson,
        on_delete=models.CASCADE,
        related_name="completions",
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="lesson_completions",
        limit_choices_to={"role": User.Role.STUDENT},
    )
    completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    time_spent_seconds = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-completed_at"]
        verbose_name = "lesson completion"
        verbose_name_plural = "lesson completions"
        unique_together = [["lesson", "student"]]
        indexes = [
            models.Index(fields=["lesson", "student"]),
            models.Index(fields=["student", "completed"]),
        ]

    def __str__(self):
        return f"{self.student} — {self.lesson}"


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
        course = self.enrollment.course
        if course.lessons.exists():
            return course.lesson_progress_for(self.enrollment.student)[
                "percentage"
            ]
        if self.completed:
            return 100
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
