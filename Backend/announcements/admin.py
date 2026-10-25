from django.contrib import admin

from .models import Announcement


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "target_audience", "is_pinned", "created_at")
    list_filter = ("target_audience", "is_pinned")
    search_fields = ("title", "content")
