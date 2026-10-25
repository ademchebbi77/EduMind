from django.contrib import admin

from .models import LiveSession, SessionEnrollment


@admin.register(LiveSession)
class LiveSessionAdmin(admin.ModelAdmin):
    list_display = ("title", "session_type", "status", "starts_at", "ends_at", "created_by")
    list_filter = ("session_type", "status")
    search_fields = ("title", "description")
    filter_horizontal = ("assigned_teachers",)
    date_hierarchy = "starts_at"


@admin.register(SessionEnrollment)
class SessionEnrollmentAdmin(admin.ModelAdmin):
    list_display = ("student", "session", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("student__email", "session__title")
