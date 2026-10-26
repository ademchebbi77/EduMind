from rest_framework import serializers

from .categorization import categorize
from .extraction import MAX_TEXT_LENGTH
from .models import Announcement, AnnouncementEnrollment
from .urgency import compute_urgency


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
    seats_taken      = serializers.SerializerMethodField()
    seats_remaining  = serializers.SerializerMethodField()
    is_enrolled      = serializers.SerializerMethodField()
    urgency          = serializers.SerializerMethodField()
    category         = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = (
            "id",
            "title",
            "content",
            "target_audience",
            "target_audience_display",
            "category_override",
            "related_session",
            "related_session_title",
            "author",
            "author_name",
            "author_role",
            "is_pinned",
            "event_date",
            "event_time",
            "meeting_link",
            "capacity",
            "enrollment_count",
            "seats_taken",
            "seats_remaining",
            "is_enrolled",
            "urgency",
            "category",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "author", "created_at", "updated_at")

    def _confirmed_count(self, obj):
        # obj.enrollments est préchargé par la vue : pas de requête par annonce.
        return sum(
            1 for enrollment in obj.enrollments.all() if enrollment.status == "confirmed"
        )

    def _active_count(self, obj):
        # Les demandes en attente réservent aussi une place.
        return sum(
            1
            for enrollment in obj.enrollments.all()
            if enrollment.status != AnnouncementEnrollment.Status.REJECTED
        )

    def get_enrollment_count(self, obj):
        return self._confirmed_count(obj)

    def get_seats_taken(self, obj):
        return self._active_count(obj)

    def get_seats_remaining(self, obj):
        if obj.capacity is None:
            return None
        return max(0, obj.capacity - self._active_count(obj))

    def get_urgency(self, obj):
        urgency = compute_urgency(obj, enrollment_count=self._confirmed_count(obj))
        return {
            "score": urgency.score,
            "level": urgency.level,
            "label": urgency.label,
            "reasons": list(urgency.reasons),
        }

    def get_category(self, obj):
        category = categorize(obj)
        return {
            "key": category.key,
            "label": category.label,
            "confidence": category.confidence,
            "keywords": list(category.matched_keywords),
            "manual": bool(obj.category_override),
        }

    def get_is_enrolled(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.enrollments.filter(student=request.user).exists()


class AnnouncementExtractionSerializer(serializers.Serializer):
    """Texte descriptif à analyser localement (aucune donnée n'est enregistrée)."""

    text = serializers.CharField(
        min_length=15,
        max_length=MAX_TEXT_LENGTH,
        error_messages={
            "required": "Saisissez le texte à analyser.",
            "blank": "Saisissez le texte à analyser.",
            "min_length": "Le texte est trop court pour être analysé (15 caractères minimum).",
            "max_length": f"Le texte ne doit pas dépasser {MAX_TEXT_LENGTH} caractères.",
        },
    )


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
            if announcement.capacity is not None:
                taken = announcement.enrollments.exclude(
                    status=AnnouncementEnrollment.Status.REJECTED
                ).count()
                if taken >= announcement.capacity:
                    raise serializers.ValidationError(
                        {"announcement": "Plus de places disponibles pour cette formation."}
                    )
        return attrs
