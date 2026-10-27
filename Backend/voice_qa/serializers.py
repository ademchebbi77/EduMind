from pathlib import Path

import filetype
from django.conf import settings
from django.urls import reverse
from rest_framework import serializers

from courses.models import Course

from .models import CourseComment, VoiceQuestion
from .permissions import can_delete_comment, can_edit_comment, can_reply_to_comment

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


def _display_name(user):
    if user is None:
        return ""
    return user.get_full_name().strip() or user.email


class VoiceQuestionSerializer(serializers.ModelSerializer):
    course_title = serializers.CharField(source="course.title", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    audio_url = serializers.SerializerMethodField()
    review_status = serializers.CharField(read_only=True)
    teacher_answered_by_name = serializers.SerializerMethodField()

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
            "rating",
            "rating_reason",
            "rating_comment",
            "rated_at",
            "escalated_at",
            "review_status",
            "teacher_answer",
            "teacher_answered_by_name",
            "teacher_answered_at",
        )
        read_only_fields = fields

    def get_audio_url(self, obj):
        return reverse("voice-question-audio", kwargs={"pk": obj.pk})

    def get_teacher_answered_by_name(self, obj):
        return _display_name(obj.teacher_answered_by) if obj.teacher_answer else ""


MAX_FEEDBACK_CHARS = 500


class RateSerializer(serializers.Serializer):
    """The student's opinion of an AI answer. A reason is required when it did not help."""

    rating = serializers.ChoiceField(choices=VoiceQuestion.Rating.choices)
    reason = serializers.ChoiceField(
        choices=VoiceQuestion.RatingReason.choices, required=False, allow_blank=True
    )
    comment = serializers.CharField(
        max_length=MAX_FEEDBACK_CHARS, required=False, allow_blank=True
    )

    def validate(self, attrs):
        if attrs["rating"] == VoiceQuestion.Rating.HELPFUL:
            attrs["reason"], attrs["comment"] = "", ""
        elif not attrs.get("reason"):
            raise serializers.ValidationError({"reason": "Tell us what was wrong with the answer."})
        attrs["comment"] = attrs.get("comment", "").strip()
        return attrs


class VoiceReviewSerializer(serializers.ModelSerializer):
    """A question sent to the teacher, as the teacher sees it."""

    course_title = serializers.CharField(source="course.title", read_only=True)
    student_name = serializers.SerializerMethodField()
    rating_reason_display = serializers.CharField(
        source="get_rating_reason_display", read_only=True
    )
    review_status = serializers.CharField(read_only=True)
    teacher_answered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = VoiceQuestion
        fields = (
            "id",
            "course",
            "course_title",
            "student_name",
            "question_text",
            "detected_language",
            "answer",
            "answer_language",
            "answered_at",
            "rating_reason",
            "rating_reason_display",
            "rating_comment",
            "escalated_at",
            "review_status",
            "teacher_answer",
            "teacher_answered_by_name",
            "teacher_answered_at",
        )
        read_only_fields = fields

    def get_student_name(self, obj):
        return _display_name(obj.student)

    def get_teacher_answered_by_name(self, obj):
        return _display_name(obj.teacher_answered_by) if obj.teacher_answer else ""


class TeacherAnswerSerializer(serializers.Serializer):
    teacher_answer = serializers.CharField(max_length=MAX_QUESTION_CHARS * 2, trim_whitespace=False)

    def validate_teacher_answer(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Write the answer first.")
        return value


MAX_COMMENT_CHARS = 2000


def _clean_comment(value):
    value = value.strip()
    if not value:
        raise serializers.ValidationError("Write something first.")
    return value


class CourseCommentSerializer(serializers.ModelSerializer):
    """A comment and what the current user may do with it."""

    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.all())
    text = serializers.CharField(max_length=MAX_COMMENT_CHARS, trim_whitespace=False)
    author_name = serializers.SerializerMethodField()
    replied_by_name = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()
    can_reply = serializers.SerializerMethodField()

    class Meta:
        model = CourseComment
        fields = (
            "id",
            "course",
            "author",
            "author_name",
            "text",
            "created_at",
            "edited_at",
            "reply",
            "replied_by_name",
            "replied_at",
            "is_mine",
            "can_edit",
            "can_delete",
            "can_reply",
        )
        read_only_fields = ("author", "edited_at", "reply", "replied_at")

    def validate_text(self, value):
        return _clean_comment(value)

    def validate_course(self, value):
        # A comment stays on its course.
        if self.instance is not None and value != self.instance.course:
            raise serializers.ValidationError("A comment cannot be moved to another course.")
        return value

    @staticmethod
    def _name(user):
        if user is None:
            return ""
        return user.get_full_name().strip() or user.email

    def get_author_name(self, comment):
        return self._name(comment.author)

    def get_replied_by_name(self, comment):
        return self._name(comment.replied_by) if comment.reply else ""

    def _user(self):
        return self.context["request"].user

    def get_is_mine(self, comment):
        return comment.author_id == self._user().id

    def get_can_edit(self, comment):
        return can_edit_comment(self._user(), comment)

    def get_can_delete(self, comment):
        return can_delete_comment(self._user(), comment)

    def get_can_reply(self, comment):
        return can_reply_to_comment(self._user(), comment)


class CommentReplySerializer(serializers.Serializer):
    reply = serializers.CharField(max_length=MAX_COMMENT_CHARS, trim_whitespace=False)

    def validate_reply(self, value):
        return _clean_comment(value)
