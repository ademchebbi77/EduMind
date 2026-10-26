from django.contrib import admin

from .models import (
    Category,
    Course,
    CourseProgress,
    CourseTranscript,
    Enrollment,
    Lesson,
    LessonCompletion,
    LessonTranscript,
)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "created_at")
    search_fields = ("name", "description")
    readonly_fields = ("created_at",)
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("name",)


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "type",
        "category",
        "owner",
        "enrolled_count",
        "max_students",
        "created_at",
    )
    list_filter = ("type", "category", "created_at")
    search_fields = ("title", "description", "tags", "owner__email")
    readonly_fields = ("type", "enrolled_count", "created_at", "updated_at")
    autocomplete_fields = ("owner", "category")
    ordering = ("-created_at",)


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = (
        "course",
        "student",
        "completed",
        "enrolled_at",
    )
    list_filter = ("course", "completed")
    search_fields = (
        "course__title",
        "student__email",
        "student__first_name",
        "student__last_name",
    )
    readonly_fields = ("enrolled_at", "completed_at")
    list_select_related = ("course", "student")
    autocomplete_fields = ("course", "student")
    ordering = ("-enrolled_at",)


@admin.register(CourseProgress)
class CourseProgressAdmin(admin.ModelAdmin):
    list_display = (
        "enrollment",
        "percentage",
        "has_opened_material",
        "completed",
        "last_viewed_at",
    )
    list_filter = ("completed", "has_opened_material")
    search_fields = (
        "enrollment__course__title",
        "enrollment__student__email",
    )
    readonly_fields = (
        "first_viewed_at",
        "last_viewed_at",
        "completed_at",
    )
    list_select_related = ("enrollment", "enrollment__course", "enrollment__student")


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "course",
        "order",
        "file_type",
        "video_url",
        "duration_minutes",
        "is_published",
        "created_at",
    )
    list_filter = ("file_type", "is_published", "created_at")
    search_fields = ("title", "description", "course__title")
    readonly_fields = ("file_type", "created_at", "updated_at")
    list_select_related = ("course",)
    autocomplete_fields = ("course",)
    ordering = ("course", "order")


@admin.register(LessonCompletion)
class LessonCompletionAdmin(admin.ModelAdmin):
    list_display = (
        "lesson",
        "student",
        "completed",
        "completed_at",
        "time_spent_seconds",
    )
    list_filter = ("completed", "created_at")
    search_fields = (
        "lesson__title",
        "lesson__course__title",
        "student__email",
    )
    readonly_fields = ("created_at",)
    list_select_related = ("lesson", "lesson__course", "student")
    autocomplete_fields = ("lesson", "student")
    ordering = ("-completed_at",)


@admin.register(CourseTranscript)
class CourseTranscriptAdmin(admin.ModelAdmin):
    list_display = (
        "course",
        "status",
        "stage",
        "progress",
        "formatted_by_ai",
        "updated_at",
    )
    list_filter = ("status", "formatted_by_ai")
    search_fields = ("course__title",)
    readonly_fields = (
        "created_at",
        "updated_at",
        "started_at",
        "completed_at",
    )
    list_select_related = ("course",)
    autocomplete_fields = ("course", "requested_by")
    ordering = ("-updated_at",)


@admin.register(LessonTranscript)
class LessonTranscriptAdmin(admin.ModelAdmin):
    list_display = (
        "lesson",
        "status",
        "stage",
        "progress",
        "formatted_by_ai",
        "updated_at",
    )
    list_filter = ("status", "formatted_by_ai")
    search_fields = ("lesson__title", "lesson__course__title")
    readonly_fields = (
        "created_at",
        "updated_at",
        "started_at",
        "completed_at",
    )
    list_select_related = ("lesson",)
    autocomplete_fields = ("lesson", "requested_by")
    ordering = ("-updated_at",)
