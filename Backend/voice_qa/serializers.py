from pathlib import Path

import filetype
from django.conf import settings
from django.urls import reverse
from rest_framework import serializers

from courses.models import Course

from .models import VoiceQuestion

# Formats accepted by the Whisper API that browsers can record or users upload.
AUDIO_EXTENSIONS = ("webm", "ogg", "oga", "mp3", "wav", "m4a", "mp4", "mpeg", "mpga", "flac")
# What the file signature may legitimately look like for those extensions.
AUDIO_SIGNATURES = {"webm", "mkv", "ogg", "opus", "mp3", "wav", "m4a", "mp4", "flac", "mpg"}
AUDIO_CONTENT_TYPES = {
    "webm": "audio/webm",
    "ogg": "audio/ogg",
    "oga": "audio/ogg",
    "mp3": "audio/mpeg",
    "mpeg": "audio/mpeg",
    "mpga": "audio/mpeg",
    "wav": "audio/wav",
    "m4a": "audio/mp4",
    "mp4": "audio/mp4",
    "flac": "audio/flac",
}
MAX_QUESTION_CHARS = 2000


def validate_audio(upload):
    name = getattr(upload, "name", "") or ""
    extension = Path(name).suffix.lower().lstrip(".")
    if extension not in AUDIO_EXTENSIONS:
        formats = ", ".join(extension.upper() for extension in AUDIO_EXTENSIONS)
        raise serializers.ValidationError(f"Unsupported audio format. Accepted formats: {formats}.")
    size = getattr(upload, "size", 0) or 0
    if size <= 0:
        raise serializers.ValidationError("The recording is empty.")
    if size > settings.VOICE_QA_MAX_AUDIO_MB * 1024 * 1024:
        raise serializers.ValidationError(
            f"The recording exceeds the maximum size of {settings.VOICE_QA_MAX_AUDIO_MB} MB."
        )
    declared = (getattr(upload, "content_type", "") or "").split(";")[0].strip().lower()
    if declared and not (declared.startswith(("audio/", "video/")) or declared == "application/octet-stream"):
        raise serializers.ValidationError("This file is not an audio recording.")

    position = upload.tell()
    header = upload.read(8192)
    upload.seek(position)
    kind = filetype.guess(header)
    if kind is None or kind.extension not in AUDIO_SIGNATURES:
        raise serializers.ValidationError("The file content is not a supported audio recording.")
    return upload


class VoiceQuestionCreateSerializer(serializers.Serializer):
    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.all())
    audio = serializers.FileField(validators=[validate_audio])
    language = serializers.ChoiceField(
        choices=VoiceQuestion.Language.choices, default=VoiceQuestion.Language.AUTO
    )


class AskSerializer(serializers.Serializer):
    question_text = serializers.CharField(max_length=MAX_QUESTION_CHARS, trim_whitespace=True)


class VoiceQuestionSerializer(serializers.ModelSerializer):
    course_title = serializers.CharField(source="course.title", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    audio_url = serializers.SerializerMethodField()

    class Meta:
        model = VoiceQuestion
        fields = (
            "id",
            "course",
            "course_title",
            "audio_url",
            "audio_name",
            "language_hint",
            "transcript",
            "detected_language",
            "question_text",
            "answer",
            "answer_language",
            "context_source",
            "status",
            "status_display",
            "failed_stage",
            "error_message",
            "transcription_ms",
            "answer_ms",
            "created_at",
            "updated_at",
            "answered_at",
        )
        read_only_fields = fields

    def get_audio_url(self, obj):
        return reverse("voice-question-audio", kwargs={"pk": obj.pk})
