from django.conf import settings
from django.db import models


class Announcement(models.Model):
    class TargetAudience(models.TextChoices):
        ALL = "all", "Tous les utilisateurs"
        STUDENTS = "students", "Étudiants seulement"
        TEACHERS = "teachers", "Enseignants seulement"

    title = models.CharField(max_length=200)
    content = models.TextField()
    target_audience = models.CharField(
        max_length=20,
        choices=TargetAudience.choices,
        default=TargetAudience.ALL,
    )
    # Lien optionnel vers une session (ex: annonce de formation)
    related_session = models.ForeignKey(
        "live_sessions.LiveSession",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="announcements",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="announcements",
    )
    is_pinned = models.BooleanField(default=False, help_text="Épingler en haut du feed")

    # Détails de l'événement (optionnels)
    event_date = models.DateField(
        "Date de l'événement",
        null=True,
        blank=True,
    )
    event_time = models.TimeField(
        "Heure de l'événement",
        null=True,
        blank=True,
    )
    meeting_link = models.URLField(
        "Lien de réunion",
        blank=True,
        default="",
        help_text="Zoom, Google Meet, Teams, etc.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_pinned", "-created_at"]
        verbose_name = "annonce"
        verbose_name_plural = "annonces"
        indexes = [
            models.Index(fields=["target_audience"]),
            models.Index(fields=["is_pinned", "-created_at"]),
        ]

    def __str__(self):
        return self.title


class AnnouncementEnrollment(models.Model):
    """Inscription d'un utilisateur à une formation annoncée."""

    class Status(models.TextChoices):
        PENDING   = "pending",   "En attente"
        CONFIRMED = "confirmed", "Confirmée"
        REJECTED  = "rejected",  "Rejetée"

    announcement = models.ForeignKey(
        Announcement,
        on_delete=models.CASCADE,
        related_name="enrollments",
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="announcement_enrollments",
    )
    # Champs du formulaire d'inscription
    full_name  = models.CharField("Nom complet",    max_length=200)
    email      = models.EmailField("Email")
    phone      = models.CharField("Téléphone",      max_length=30,  blank=True)
    message    = models.TextField("Message / Motivation", blank=True)

    status     = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "inscription à une annonce"
        verbose_name_plural = "inscriptions aux annonces"
        constraints = [
            models.UniqueConstraint(
                fields=["announcement", "student"],
                name="announcements_enrollment_unique",
            )
        ]

    def __str__(self):
        return f"{self.student} → {self.announcement}"
