from django.conf import settings
from django.db import models
from django.utils import timezone


class LiveSession(models.Model):
    class SessionType(models.TextChoices):
        COURSE = "course", "Cours en ligne"
        TRAINING = "training", "Formation"

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Planifiée"
        ONGOING = "ongoing", "En cours"
        ENDED = "ended", "Terminée"
        CANCELLED = "cancelled", "Annulée"

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    session_type = models.CharField(
        max_length=20,
        choices=SessionType.choices,
        default=SessionType.COURSE,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SCHEDULED,
    )
    meeting_link = models.URLField(
        "Lien de réunion",
        blank=True,
        help_text="Lien Zoom, Google Meet, Teams, etc.",
    )
    starts_at = models.DateTimeField("Date et heure de début")
    ends_at = models.DateTimeField("Date et heure de fin")

    # Course en ligne : lié à un cours existant (optionnel)
    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="live_sessions",
    )

    # Créateur de la session (teacher ou admin)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_sessions",
    )

    # Teachers assignés à cette session (pour les formations admin)
    assigned_teachers = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="assigned_sessions",
        limit_choices_to={"role": "teacher"},
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["starts_at"]
        verbose_name = "session en ligne"
        verbose_name_plural = "sessions en ligne"
        indexes = [
            models.Index(fields=["session_type"]),
            models.Index(fields=["status"]),
            models.Index(fields=["starts_at"]),
        ]

    @property
    def is_upcoming(self):
        return self.starts_at > timezone.now()

    @property
    def duration_minutes(self):
        delta = self.ends_at - self.starts_at
        return int(delta.total_seconds() / 60)

    def __str__(self):
        return f"{self.title} ({self.get_session_type_display()})"


class SessionEnrollment(models.Model):
    """Inscription d'un étudiant à une formation."""

    class EnrollmentStatus(models.TextChoices):
        PENDING = "pending", "En attente"
        CONFIRMED = "confirmed", "Confirmée"
        REJECTED = "rejected", "Rejetée"

    session = models.ForeignKey(
        LiveSession,
        on_delete=models.CASCADE,
        related_name="enrollments",
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="session_enrollments",
    )
    status = models.CharField(
        max_length=20,
        choices=EnrollmentStatus.choices,
        default=EnrollmentStatus.PENDING,
    )
    message = models.TextField(
        blank=True,
        help_text="Message optionnel de l'étudiant lors de l'inscription.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "inscription"
        verbose_name_plural = "inscriptions"
        constraints = [
            models.UniqueConstraint(
                fields=["session", "student"],
                name="sessions_enrollment_unique",
            )
        ]

    def __str__(self):
        return f"{self.student} → {self.session}"
