from django.utils import timezone
from rest_framework import serializers

from accounts.models import User
from accounts.serializers import UserSerializer

from .models import LiveSession, SessionEnrollment


class LiveSessionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    session_type_display = serializers.CharField(source="get_session_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    course_title = serializers.CharField(source="course.title", read_only=True, default=None)
    duration_minutes = serializers.IntegerField(read_only=True)
    is_upcoming = serializers.BooleanField(read_only=True)
    enrollment_count = serializers.SerializerMethodField()
    is_enrolled = serializers.SerializerMethodField()

    # IDs des teachers assignés (écriture), noms complets (lecture)
    assigned_teachers = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=User.objects.filter(role=User.Role.TEACHER),
        required=False,
    )
    assigned_teachers_detail = serializers.SerializerMethodField()

    class Meta:
        model = LiveSession
        fields = (
            "id",
            "title",
            "description",
            "session_type",
            "session_type_display",
            "status",
            "status_display",
            "meeting_link",
            "starts_at",
            "ends_at",
            "course",
            "course_title",
            "created_by",
            "created_by_name",
            "assigned_teachers",
            "assigned_teachers_detail",
            "enrollment_count",
            "is_enrolled",
            "duration_minutes",
            "is_upcoming",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_by", "created_at", "updated_at")

    def get_enrollment_count(self, obj):
        return obj.enrollments.filter(status="confirmed").count()

    def get_is_enrolled(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.enrollments.filter(student=request.user).exists()

    def get_assigned_teachers_detail(self, obj):
        return [
            {"id": t.id, "full_name": t.full_name, "email": t.email}
            for t in obj.assigned_teachers.all()
        ]

    def validate(self, attrs):
        starts_at = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))

        if starts_at and ends_at:
            if ends_at <= starts_at:
                raise serializers.ValidationError(
                    {"ends_at": "La date de fin doit être après la date de début."}
                )
            # On ne bloque pas les dates passées pour permettre la création de sessions rétroactives

        # Un teacher ne peut créer que des sessions de type "course"
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            user = request.user
            session_type = attrs.get("session_type", getattr(self.instance, "session_type", None))
            if user.role == User.Role.TEACHER and session_type == LiveSession.SessionType.TRAINING:
                raise serializers.ValidationError(
                    {"session_type": "Un enseignant ne peut créer que des cours en ligne."}
                )

        return attrs


class SessionEnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_email = serializers.CharField(source="student.email", read_only=True)
    session_title = serializers.CharField(source="session.title", read_only=True)
    session_starts_at = serializers.DateTimeField(source="session.starts_at", read_only=True)
    session_ends_at = serializers.DateTimeField(source="session.ends_at", read_only=True)
    session_type = serializers.CharField(source="session.session_type", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = SessionEnrollment
        fields = (
            "id",
            "session",
            "session_title",
            "session_starts_at",
            "session_ends_at",
            "session_type",
            "student",
            "student_name",
            "student_email",
            "status",
            "status_display",
            "message",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "student", "created_at", "updated_at")

    def validate(self, attrs):
        request = self.context.get("request")
        session = attrs.get("session")

        # Vérifier que la session est une formation (les cours en ligne n'ont pas d'inscription)
        if session and session.session_type != LiveSession.SessionType.TRAINING:
            raise serializers.ValidationError(
                {"session": "L'inscription est uniquement pour les formations."}
            )

        # Vérifier que la session n'est pas annulée ou terminée
        if session and session.status in [LiveSession.Status.ENDED, LiveSession.Status.CANCELLED]:
            raise serializers.ValidationError(
                {"session": "Cette session est terminée ou annulée."}
            )

        # Vérifier doublon
        if request and session:
            if SessionEnrollment.objects.filter(session=session, student=request.user).exists():
                raise serializers.ValidationError(
                    {"session": "Vous êtes déjà inscrit à cette formation."}
                )

        return attrs
