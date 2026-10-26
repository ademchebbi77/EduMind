import uuid
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from courses.models import Course
from courses.validators import PDF_EXTENSIONS, validate_course_file


class Difficulty(models.TextChoices):
    BEGINNER = "beginner", "Beginner"
    INTERMEDIATE = "intermediate", "Intermediate"
    ADVANCED = "advanced", "Advanced"


# Used to sort by difficulty in a meaningful order instead of alphabetically.
DIFFICULTY_RANK = {
    Difficulty.BEGINNER: 1,
    Difficulty.INTERMEDIATE: 2,
    Difficulty.ADVANCED: 3,
}


class Quiz(models.Model):
    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name="quizzes",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    difficulty = models.CharField(
        max_length=20,
        choices=Difficulty.choices,
        default=Difficulty.BEGINNER,
    )
    duration_minutes = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(300)],
        help_text="Leave empty for an untimed quiz.",
    )
    passing_score = models.PositiveSmallIntegerField(
        default=50,
        validators=[MaxValueValidator(100)],
        help_text="Minimum percentage required to pass.",
    )
    max_attempts = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
        help_text="Leave empty for unlimited attempts.",
    )
    reveal_answers = models.BooleanField(
        default=True,
        help_text="Show correct answers and explanations after submission.",
    )
    is_published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "quiz"
        verbose_name_plural = "quizzes"
        indexes = [
            models.Index(fields=["difficulty"]),
            models.Index(fields=["is_published"]),
        ]

    def __str__(self):
        return self.title


class Question(models.Model):
    class Type(models.TextChoices):
        SINGLE_CHOICE = "single_choice", "Single choice"
        MULTIPLE_CHOICE = "multiple_choice", "Multiple choice"
        TRUE_FALSE = "true_false", "True / False"

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="questions")
    text = models.TextField()
    type = models.CharField(max_length=20, choices=Type.choices)
    points = models.PositiveSmallIntegerField(
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
    )
    explanation = models.TextField(blank=True)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        verbose_name = "question"
        verbose_name_plural = "questions"

    def __str__(self):
        return self.text[:80]


class AnswerOption(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="options")
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        verbose_name = "answer option"
        verbose_name_plural = "answer options"

    def __str__(self):
        return self.text


class QuizAttempt(models.Model):
    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", "In progress"
        SUBMITTED = "submitted", "Submitted"
        EXPIRED = "expired", "Expired"

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="attempts")
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="quiz_attempts",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.IN_PROGRESS,
    )
    score = models.PositiveIntegerField(default=0)
    max_score = models.PositiveIntegerField(default=0)
    percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    passed = models.BooleanField(default=False)
    started_at = models.DateTimeField(auto_now_add=True)
    # Snapshot of the deadline so later edits to the quiz duration do not
    # change the rules of an attempt that is already running.
    expires_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]
        verbose_name = "quiz attempt"
        verbose_name_plural = "quiz attempts"
        indexes = [models.Index(fields=["quiz", "student"])]

    def __str__(self):
        return f"{self.student} – {self.quiz}"

    def compute_expiry(self, started_at):
        if self.quiz.duration_minutes:
            return started_at + timedelta(minutes=self.quiz.duration_minutes)
        return None


class AttemptAnswer(models.Model):
    attempt = models.ForeignKey(QuizAttempt, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="+")
    selected_options = models.ManyToManyField(AnswerOption, blank=True, related_name="+")
    is_correct = models.BooleanField(default=False)
    points_awarded = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "attempt answer"
        verbose_name_plural = "attempt answers"
        constraints = [
            models.UniqueConstraint(
                fields=["attempt", "question"],
                name="assessments_answer_unique_question",
            ),
        ]


def exercise_attachment_path(instance, filename):
    extension = Path(filename).suffix.lower()
    return f"exercises/{uuid.uuid4().hex}{extension}"


class Exercise(models.Model):
    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name="exercises",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    instructions = models.TextField()
    difficulty = models.CharField(
        max_length=20,
        choices=Difficulty.choices,
        default=Difficulty.BEGINNER,
    )
    points = models.PositiveSmallIntegerField(
        default=10,
        validators=[MinValueValidator(1), MaxValueValidator(1000)],
    )
    due_at = models.DateTimeField(null=True, blank=True)
    # Optional supporting material (worksheet, audio...). Same formats and
    # checks as course files, stored privately under a UUID name.
    attachment = models.FileField(
        upload_to=exercise_attachment_path,
        validators=[validate_course_file],
        blank=True,
    )
    attachment_name = models.CharField(max_length=255, blank=True)
    is_published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "exercise"
        verbose_name_plural = "exercises"
        indexes = [
            models.Index(fields=["difficulty"]),
            models.Index(fields=["is_published"]),
        ]

    def __str__(self):
        return self.title

    @property
    def attachment_type(self):
        if not self.attachment:
            return None
        extension = Path(self.attachment.name).suffix.lower().lstrip(".")
        return "pdf" if extension in PDF_EXTENSIONS else "audio"


class ExerciseSubmission(models.Model):
    exercise = models.ForeignKey(
        Exercise,
        on_delete=models.CASCADE,
        related_name="submissions",
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="exercise_submissions",
    )
    content = models.TextField()
    score = models.PositiveSmallIntegerField(null=True, blank=True)
    feedback = models.TextField(blank=True)
    graded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    graded_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "exercise submission"
        verbose_name_plural = "exercise submissions"
        constraints = [
            models.UniqueConstraint(
                fields=["exercise", "student"],
                name="assessments_submission_unique_student",
            ),
        ]

    def __str__(self):
        return f"{self.student} – {self.exercise}"

    @property
    def is_graded(self):
        return self.graded_at is not None


def generation_source_path(instance, filename):
    extension = Path(filename).suffix.lower()
    return f"quiz-generation/{uuid.uuid4().hex}{extension}"


class QuizGenerationJob(models.Model):
    """A background run of the local quiz generator (see assessments.generation)."""

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    class Stage(models.TextChoices):
        QUEUED = "queued", "Waiting for a worker"
        EXTRACTING = "extracting", "Reading the document"
        ANALYSING = "analysing", "Finding key ideas"
        GENERATING = "generating", "Writing questions"
        DONE = "done", "Complete"
        FAILED = "failed", "Failed"

    MIXED = "mixed"
    DIFFICULTY_CHOICES = [(MIXED, "Mixed"), *Difficulty.choices]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="quiz_generation_jobs",
    )
    course = models.ForeignKey(
        Course,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quiz_generation_jobs",
    )
    # Uploaded documents are only kept until the worker has read them.
    source_file = models.FileField(upload_to=generation_source_path, blank=True)
    source_name = models.CharField(max_length=255)
    num_questions = models.PositiveSmallIntegerField(
        default=10,
        validators=[MinValueValidator(3), MaxValueValidator(30)],
    )
    difficulty = models.CharField(max_length=20, choices=DIFFICULTY_CHOICES, default=MIXED)
    question_types = models.JSONField(default=list)

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.QUEUED)
    stage = models.CharField(max_length=12, choices=Stage.choices, default=Stage.QUEUED)
    progress = models.PositiveSmallIntegerField(default=0)
    language = models.CharField(max_length=10, blank=True)
    engine = models.CharField(max_length=80, blank=True)
    result = models.JSONField(null=True, blank=True)
    stats = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    # Filled when the teacher saves a quiz from this job: how many generated
    # questions were kept, edited or removed (used for the quality metrics).
    quiz = models.ForeignKey(
        Quiz,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generation_jobs",
    )
    feedback = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "quiz generation job"
        verbose_name_plural = "quiz generation jobs"
        indexes = [models.Index(fields=["requested_by", "status"])]

    def __str__(self):
        return f"{self.source_name} ({self.status})"

    @property
    def queue_ms(self):
        if not self.started_at:
            return None
        return round((self.started_at - self.created_at).total_seconds() * 1000)

    @property
    def processing_ms(self):
        if not (self.started_at and self.finished_at):
            return None
        return round((self.finished_at - self.started_at).total_seconds() * 1000)
