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
