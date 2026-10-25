from django.contrib import admin

from .models import (
    Category,
    Course,
    CourseProgress,
    CourseTranscript,
    Enrollment,
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
