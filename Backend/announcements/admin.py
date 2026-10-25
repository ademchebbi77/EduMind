from django.contrib import admin
from django.utils.html import format_html

from .models import Announcement, AnnouncementEnrollment
from .urgency import compute_urgency

_LEVEL_COLORS = {"high": "#b91c1c", "medium": "#b45309", "low": "#64748b"}


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "author",
        "target_audience",
        "is_pinned",
        "urgency_score",
        "created_at",
    )
    list_filter = ("target_audience", "is_pinned")
    search_fields = ("title", "content")
    list_select_related = ("author",)

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("enrollments")

    @admin.display(description="Urgence")
    def urgency_score(self, obj):
        confirmed = sum(
            1
            for enrollment in obj.enrollments.all()
            if enrollment.status == AnnouncementEnrollment.Status.CONFIRMED
        )
        urgency = compute_urgency(obj, enrollment_count=confirmed)
        return format_html(
            '<strong style="color:{}">{}/100</strong> '
            '<span style="color:#64748b">{}</span>',
            _LEVEL_COLORS[urgency.level],
            urgency.score,
            urgency.label,
        )
