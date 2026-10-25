from rest_framework import serializers

from .models import Announcement, AnnouncementEnrollment


class AnnouncementSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True)
    author_role = serializers.CharField(source="author.role", read_only=True)
    target_audience_display = serializers.CharField(
        source="get_target_audience_display", read_only=True
    )
    related_session_title = serializers.CharField(
        source="related_session.title", read_only=True, default=None
    )
    enrollment_count = serializers.SerializerMethodField()
    is_enrolled      = serializers.SerializerMethodField()

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
            "event_date",
            "event_time",
            "meeting_link",
            "enrollment_count",
            "is_enrolled",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "author", "created_at", "updated_at")

    def get_enrollment_count(self, obj):
        return obj.enrollments.filter(status="confirmed").count()

    def get_is_enrolled(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.enrollments.filter(student=request.user).exists()


class AnnouncementEnrollmentSerializer(serializers.ModelSerializer):
    student_name  = serializers.CharField(source="student.full_name", read_only=True)
    student_email = serializers.CharField(source="student.email",     read_only=True)
    announcement_title = serializers.CharField(source="announcement.title", read_only=True)
    status_display     = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model  = AnnouncementEnrollment
        fields = (
            "id",
            "announcement",
            "announcement_title",
            "student",
            "student_name",
            "student_email",
            "full_name",
            "email",
            "phone",
            "message",
            "status",
            "status_display",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "student", "created_at", "updated_at")

    def validate(self, attrs):
        request     = self.context.get("request")
        announcement = attrs.get("announcement")
        if request and announcement:
            if AnnouncementEnrollment.objects.filter(
                announcement=announcement, student=request.user
            ).exists():
                raise serializers.ValidationError(
                    {"announcement": "Vous êtes déjà inscrit à cette formation."}
                )
        return attrs
