import uuid
from pathlib import Path

from django.conf import settings
from django.db import models

from .validators import validate_course_file


def course_upload_path(instance, filename):
    extension = Path(filename).suffix.lower()
    return f"courses/{uuid.uuid4().hex}{extension}"


class Course(models.Model):
    class Type(models.TextChoices):
        PDF = "pdf", "PDF"
        AUDIO = "audio", "Audio"

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    type = models.CharField(max_length=10, choices=Type.choices, editable=False)
    file = models.FileField(
        upload_to=course_upload_path,
        validators=[validate_course_file],
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="courses",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "course"
        verbose_name_plural = "courses"
        indexes = [
            models.Index(fields=["type"]),
            models.Index(fields=["owner"]),
        ]

    def save(self, *args, **kwargs):
        if self.file:
            extension = Path(self.file.name).suffix.lower().lstrip(".")
            self.type = self.Type.PDF if extension == "pdf" else self.Type.AUDIO
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title
