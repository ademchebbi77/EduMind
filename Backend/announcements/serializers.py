from rest_framework import serializers

from .models import Announcement


class AnnouncementSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True)
    author_role = serializers.CharField(source="author.role", read_only=True)
    target_audience_display = serializers.CharField(
        source="get_target_audience_display", read_only=True
    )
    related_session_title = serializers.CharField(
        source="related_session.title", read_only=True, default=None
    )

    class Meta:
        model = Announcement
        fields = (
            "id",
            "title",
            "content",
            "target_audience",
            "target_audience_display",
            "related_session",
            "related_session_title",
            "author",
            "author_name",
            "author_role",
            "is_pinned",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "author", "created_at", "updated_at")
