from django.contrib import admin

from .models import Course


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ("title", "type", "owner", "created_at")
    list_filter = ("type", "created_at")
    search_fields = ("title", "description", "owner__email")
    readonly_fields = ("type", "created_at", "updated_at")
    autocomplete_fields = ("owner",)
    ordering = ("-created_at",)
