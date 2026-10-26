import logging
from urllib.parse import urlsplit

from django.conf import settings
from django.urls import reverse
from rest_framework import serializers

from accounts.models import User

from .models import (
    Category,
    Course,
    CourseProgress,
    CourseTranscript,
    Enrollment,
    Lesson,
    LessonCompletion,
)
from .validators import validate_course_file, validate_thumbnail

logger = logging.getLogger(__name__)

VIDEO_URL_HOSTS = ("youtube.com", "youtu.be", "vimeo.com")

TRANSCRIPT_LANGUAGES = [
    ("ar", "Arabic"),
    ("zh", "Chinese"),
    ("nl", "Dutch"),
    ("en", "English"),
    ("fr", "French"),
    ("de", "German"),
    ("el", "Greek"),
    ("it", "Italian"),
    ("ja", "Japanese"),
    ("ko", "Korean"),
    ("pt", "Portuguese"),
    ("es", "Spanish"),
    ("tr", "Turkish"),
    ("vi", "Vietnamese"),
]


def _is_supported_video_host(host):
    host = (host or "").lower().rstrip(".")
    return any(host == allowed or host.endswith(f".{allowed}") for allowed in VIDEO_URL_HOSTS)


def _course_thumbnail_url(course):
    if not course.thumbnail:
        return None
    return reverse("course-thumbnail", kwargs={"pk": course.pk})


class TagListField(serializers.Field):
    default_error_messages = {
        "invalid": "Tags must be a list of strings or a comma-separated string.",
        "too_long": "Each tag must be at most 50 characters.",
        "total_too_long": "Tags must be at most 500 characters in total.",
    }

    def to_representation(self, value):
        return [tag.strip() for tag in (value or "").split(",") if tag.strip()]

    def to_internal_value(self, data):
        if isinstance(data, str):
            raw_tags = data.split(",")
        elif isinstance(data, (list, tuple)):
            raw_tags = data
        else:
            self.fail("invalid")

        tags = []
        seen = set()
        for item in raw_tags:
            if not isinstance(item, str):
                self.fail("invalid")
            tag = item.strip()
            if not tag:
                continue
            if len(tag) > 50:
                self.fail("too_long")
            lowered = tag.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            tags.append(tag)

        value = ",".join(tags)
        if len(value) > 500:
            self.fail("total_too_long")
        return value


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name", "slug", "description", "created_at")
        read_only_fields = ("id", "slug", "created_at")

    def validate_name(self, value):
        return value.strip()


class EnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_email = serializers.CharField(source="student.email", read_only=True)
    course_title = serializers.CharField(source="course.title", read_only=True)
    course_type = serializers.CharField(source="course.type", read_only=True)
    course_thumbnail_url = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()
    completed = serializers.SerializerMethodField()
    completed_at = serializers.SerializerMethodField()
    has_opened_material = serializers.SerializerMethodField()
    video_duration_seconds = serializers.SerializerMethodField()
    video_watched_seconds = serializers.SerializerMethodField()
    last_position_seconds = serializers.SerializerMethodField()
    total_pages = serializers.SerializerMethodField()
    pages_viewed = serializers.SerializerMethodField()
    last_viewed_at = serializers.SerializerMethodField()

    class Meta:
        model = Enrollment
        fields = (
            "id",
            "course",
            "course_title",
            "course_type",
            "course_thumbnail_url",
            "student",
            "student_name",
            "student_email",
            "enrolled_at",
            "progress",
            "completed",
            "completed_at",
            "has_opened_material",
            "video_duration_seconds",
            "video_watched_seconds",
            "last_position_seconds",
            "total_pages",
            "pages_viewed",
            "last_viewed_at",
        )
        read_only_fields = (
            "id",
            "student",
            "enrolled_at",
            "completed_at",
        )

    def get_course_thumbnail_url(self, obj):
        return _course_thumbnail_url(obj.course)

    @staticmethod
    def _progress(obj):
        try:
            return obj.course_progress
        except CourseProgress.DoesNotExist:
            return None

    def get_progress(self, obj):
        progress = self._progress(obj)
        return progress.percentage if progress else 0

    def get_completed(self, obj):
        progress = self._progress(obj)
        return progress.completed if progress else obj.completed

    def get_completed_at(self, obj):
        progress = self._progress(obj)
        return progress.completed_at if progress else obj.completed_at

    def get_has_opened_material(self, obj):
        progress = self._progress(obj)
        return bool(progress and progress.has_opened_material)

    def get_video_duration_seconds(self, obj):
        progress = self._progress(obj)
        return progress.video_duration_seconds if progress else 0

    def get_video_watched_seconds(self, obj):
        progress = self._progress(obj)
        return progress.video_watched_seconds if progress else 0

    def get_last_position_seconds(self, obj):
        progress = self._progress(obj)
        return progress.last_position_seconds if progress else 0

    def get_total_pages(self, obj):
        progress = self._progress(obj)
        return progress.total_pages if progress else 0

    def get_pages_viewed(self, obj):
        progress = self._progress(obj)
        return progress.pages_viewed if progress else 0

    def get_last_viewed_at(self, obj):
        progress = self._progress(obj)
        return progress.last_viewed_at if progress else None

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if self.instance is None:
            course = attrs.get("course")
            if not user or not user.is_authenticated:
                raise serializers.ValidationError(
                    {"course": "You must be signed in to enroll."}
                )
            if user.role != User.Role.STUDENT:
                raise serializers.ValidationError(
                    {"course": "Only students can enroll in courses."}
                )
            if course is None:
                raise serializers.ValidationError(
                    {"course": "A course is required."}
                )
            if course.is_full:
                raise serializers.ValidationError(
                    {"course": "This course is full."}
                )
            if Enrollment.objects.filter(
                course=course, student=user
            ).exists():
                raise serializers.ValidationError(
                    {"course": "You are already enrolled in this course."}
                )
        elif "course" in attrs and attrs["course"] != self.instance.course:
            raise serializers.ValidationError(
                {"course": "The course cannot be changed."}
            )

        return attrs


class CourseProgressSerializer(serializers.ModelSerializer):
    progress = serializers.SerializerMethodField()

    class Meta:
        model = CourseProgress
        fields = (
            "progress",
            "video_duration_seconds",
            "video_watched_seconds",
            "last_position_seconds",
            "total_pages",
            "pages_viewed",
            "has_opened_material",
            "first_viewed_at",
            "last_viewed_at",
            "completed",
            "completed_at",
        )

    def get_progress(self, obj):
        return obj.percentage


class CourseTranscriptSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(
        source="get_status_display", read_only=True
    )
    stage_display = serializers.CharField(
        source="get_stage_display", read_only=True
    )

    class Meta:
        model = CourseTranscript
        fields = (
            "status",
            "status_display",
            "stage",
            "stage_display",
            "progress",
            "language",
            "model_name",
            "text",
            "formatted_by_ai",
            "segment_count",
            "error_message",
            "started_at",
            "completed_at",
            "updated_at",
        )
        read_only_fields = fields


class CourseTranscriptRequestSerializer(serializers.Serializer):
    language = serializers.ChoiceField(
        choices=TRANSCRIPT_LANGUAGES,
        default=settings.COHERE_TRANSCRIPT_LANGUAGE,
        required=False,
    )


class CourseContentAnalysisSerializer(serializers.Serializer):
    file = serializers.FileField(required=False)
    course_id = serializers.IntegerField(required=False, min_value=1)

    def validate(self, attrs):
        has_file = bool(attrs.get("file"))
        has_course = bool(attrs.get("course_id"))
        if has_file == has_course:
            raise serializers.ValidationError(
                "Provide either a file or a course_id, but not both."
            )
        return attrs


class BulkLessonAnalysisSerializer(serializers.Serializer):
    files = serializers.ListField(
        child=serializers.FileField(validators=[validate_course_file]),
        min_length=1,
        max_length=10,
        error_messages={
            "min_length": "Upload at least 1 file.",
            "max_length": "Upload 1-10 files maximum.",
        },
    )


class CourseProgressUpdateSerializer(serializers.Serializer):
    video_duration_seconds = serializers.IntegerField(min_value=0, required=False)
    video_watched_seconds = serializers.IntegerField(min_value=0, required=False)
    last_position_seconds = serializers.IntegerField(min_value=0, required=False)
    total_pages = serializers.IntegerField(min_value=0, required=False)
    pages_viewed = serializers.IntegerField(min_value=0, required=False)
    has_opened_material = serializers.BooleanField(required=False)

    def validate(self, attrs):
        duration = attrs.get("video_duration_seconds")
        if duration is not None:
            for field in ("video_watched_seconds", "last_position_seconds"):
                if field in attrs:
                    attrs[field] = min(attrs[field], duration)

        total_pages = attrs.get("total_pages")
        if total_pages is not None and "pages_viewed" in attrs:
            attrs["pages_viewed"] = min(attrs["pages_viewed"], total_pages)

        return attrs


class LessonSerializer(serializers.ModelSerializer):
    file = serializers.FileField(
        write_only=True,
        required=False,
        validators=[validate_course_file],
    )
    file_url = serializers.SerializerMethodField()
    file_type = serializers.CharField(read_only=True)
    is_locked = serializers.SerializerMethodField()
    is_completed = serializers.SerializerMethodField()
    completed_at = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = (
            "id",
            "course",
            "title",
            "description",
            "order",
            "file",
            "file_url",
            "file_type",
            "video_url",
            "duration_minutes",
            "is_published",
            "is_locked",
            "is_completed",
            "completed_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "course",
            "file_type",
            "created_at",
            "updated_at",
        )
        extra_kwargs = {
            "order": {"required": False, "min_value": 1},
            "is_published": {"required": False, "default": True},
        }

    def _student(self):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user and user.is_authenticated and user.role == User.Role.STUDENT:
            return user
        return None

    def _status_for(self, obj):
        statuses = self.context.get("lesson_statuses") or {}
        return statuses.get(obj.pk)

    def _completion(self, obj):
        student = self._student()
        if student is None:
            return None
        return LessonCompletion.objects.filter(
            lesson=obj, student=student, completed=True
        ).first()

    def get_file_url(self, obj):
        if not obj.file:
            return None
        return reverse(
            "lesson-file", kwargs={"course_id": obj.course_id, "pk": obj.pk}
        )

    def get_is_completed(self, obj):
        status = self._status_for(obj)
        if status:
            return status["is_completed"]
        return self._completion(obj) is not None

    def get_is_locked(self, obj):
        status = self._status_for(obj)
        if status:
            return status["is_locked"]
        student = self._student()
        if student is None:
            return False
        return obj.is_locked_for(student)

    def get_completed_at(self, obj):
        status = self._status_for(obj)
        if status:
            return status.get("completed_at")
        completion = self._completion(obj)
        return completion.completed_at if completion else None

    def validate_order(self, value):
        if value < 1:
            raise serializers.ValidationError(
                "The order must be at least 1."
            )
        return value

    def validate_video_url(self, value):
        if not value:
            return value
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise serializers.ValidationError(
                "Enter a valid YouTube or Vimeo URL."
            )
        if not _is_supported_video_host(parsed.hostname):
            raise serializers.ValidationError(
                "Only YouTube and Vimeo links are supported."
            )
        return value

    def validate(self, attrs):
        file = attrs.get("file")
        video_url = attrs.get("video_url")
        if self.instance is not None:
            if "file" not in attrs:
                file = self.instance.file
            if "video_url" not in attrs:
                video_url = self.instance.video_url
        if not file and not video_url:
            raise serializers.ValidationError(
                {"file": "Upload a file or provide a YouTube/Vimeo link."}
            )
        return attrs

    def _delete_stored_file(self, field_file):
        if not field_file:
            return
        try:
            if field_file.storage.exists(field_file.name):
                field_file.storage.delete(field_file.name)
        except Exception:
            logger.exception("Unable to delete a replaced lesson file")

    def update(self, instance, validated_data):
        old_file = instance.file if instance.file else None
        updated = super().update(instance, validated_data)

        new_file = validated_data.get("file")
        if new_file and old_file and old_file.name != updated.file.name:
            self._delete_stored_file(old_file)

        return updated


class LessonReorderSerializer(serializers.Serializer):
    lesson_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )


class LessonCompleteSerializer(serializers.Serializer):
    time_spent_seconds = serializers.IntegerField(
        min_value=0, required=False, default=0
    )


class CourseSerializer(serializers.ModelSerializer):
    file = serializers.FileField(
        write_only=True,
        required=False,
        validators=[validate_course_file],
    )
    thumbnail = serializers.ImageField(
        write_only=True,
        required=False,
        allow_null=True,
        validators=[validate_thumbnail],
    )
    type = serializers.CharField(read_only=True)
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    difficulty_display = serializers.CharField(
        source="get_difficulty_display", read_only=True
    )
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        required=False,
        allow_null=True,
    )
    category_name = serializers.CharField(
        source="category.name", read_only=True, default=None
    )
    category_slug = serializers.CharField(
        source="category.slug", read_only=True, default=None
    )
    tags = TagListField(required=False)
    file_url = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()
    has_file = serializers.SerializerMethodField()
    enrolled_count = serializers.IntegerField(read_only=True)
    is_full = serializers.BooleanField(read_only=True)
    is_enrolled = serializers.SerializerMethodField()
    can_enroll = serializers.SerializerMethodField()
    lessons = serializers.SerializerMethodField()
    lesson_count = serializers.SerializerMethodField()
    completed_lessons = serializers.SerializerMethodField()
    progress_percentage = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = (
            "id",
            "title",
            "description",
            "type",
            "type_display",
            "file",
            "file_url",
            "download_url",
            "has_file",
            "video_url",
            "thumbnail",
            "thumbnail_url",
            "category",
            "category_name",
            "category_slug",
            "tags",
            "difficulty",
            "difficulty_display",
            "owner",
            "owner_name",
            "max_students",
            "enrolled_count",
            "is_full",
            "is_enrolled",
            "can_enroll",
            "lessons",
            "lesson_count",
            "completed_lessons",
            "progress_percentage",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "owner",
            "enrolled_count",
            "created_at",
            "updated_at",
        )

    def _student(self):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user and user.is_authenticated and user.role == User.Role.STUDENT:
            return user
        return None

    def get_lessons(self, obj):
        if not self.context.get("include_lessons"):
            return []
        lessons = list(obj.lessons.all())
        if self._student() is not None:
            lessons = [lesson for lesson in lessons if lesson.is_published]
        context = dict(self.context)
        context.setdefault(
            "lesson_statuses",
            self.context.get("lesson_statuses") or {},
        )
        return LessonSerializer(lessons, many=True, context=context).data

    def get_lesson_count(self, obj):
        annotated = getattr(obj, "lesson_count", None)
        if annotated is not None:
            return annotated
        return obj.lessons.count()

    def get_completed_lessons(self, obj):
        student = self._student()
        if student is None:
            return None
        annotated = getattr(obj, "completed_lessons_count", None)
        if annotated is not None:
            return annotated
        return obj.lesson_progress_for(student)["completed_lessons"]

    def get_progress_percentage(self, obj):
        student = self._student()
        if student is None:
            return None
        annotated = getattr(obj, "published_lesson_count", None)
        total = (
            annotated
            if annotated is not None
            else obj.lessons.filter(is_published=True).count()
        )
        if not total:
            return 0
        completed = self.get_completed_lessons(obj) or 0
        return round(completed * 100 / total, 2)

    def get_file_url(self, obj):
        return reverse("course-file", kwargs={"pk": obj.pk})

    def get_download_url(self, obj):
        return reverse("course-download", kwargs={"pk": obj.pk})

    def get_has_file(self, obj):
        return bool(obj.file)

    def get_thumbnail_url(self, obj):
        return _course_thumbnail_url(obj)

    def get_is_enrolled(self, obj):
        annotated = getattr(obj, "is_enrolled", None)
        if isinstance(annotated, bool):
            return annotated
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.enrollments.filter(student=request.user).exists()

    def get_can_enroll(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if user.role != User.Role.STUDENT:
            return False
        if obj.is_full:
            return False
        return not self.get_is_enrolled(obj)

    def validate_video_url(self, value):
        if not value:
            return value
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise serializers.ValidationError(
                "Enter a valid YouTube or Vimeo URL."
            )
        if not _is_supported_video_host(parsed.hostname):
            raise serializers.ValidationError(
                "Only YouTube and Vimeo links are supported."
            )
        return value

    def validate(self, attrs):
        # The file and video URL are optional: a course can be assembled from
        # lessons instead of a single material file.
        return attrs

    def _delete_stored_file(self, field_file):
        if not field_file:
            return
        try:
            if field_file.storage.exists(field_file.name):
                field_file.storage.delete(field_file.name)
        except Exception:
            logger.exception(
                "Unable to delete a replaced file for course %s",
                field_file.instance.pk,
            )

    def update(self, instance, validated_data):
        old_file = instance.file if instance.file else None
        old_thumbnail = instance.thumbnail if instance.thumbnail else None

        updated = super().update(instance, validated_data)

        new_file = validated_data.get("file")
        if new_file and old_file and old_file.name != updated.file.name:
            self._delete_stored_file(old_file)
            CourseTranscript.objects.filter(course=updated).delete()

        if "thumbnail" in validated_data:
            replacement = updated.thumbnail if updated.thumbnail else None
            if old_thumbnail and (
                replacement is None
                or old_thumbnail.name != replacement.name
            ):
                self._delete_stored_file(old_thumbnail)

        return updated
