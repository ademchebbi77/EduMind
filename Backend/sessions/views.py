from dataclasses import asdict

from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User
from accounts.permissions import IsAdminRole

from .forecast import forecast_upcoming
from .models import LiveSession, SessionEnrollment
from .permissions import CanManageEnrollment, CanManageSession
from .recommendations import recommend_sessions_for
from .scheduling import best_time_slots
from .serializers import LiveSessionSerializer, SessionEnrollmentSerializer


class LiveSessionViewSet(viewsets.ModelViewSet):
    serializer_class = LiveSessionSerializer
    permission_classes = [IsAuthenticated, CanManageSession]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["title", "description"]
    ordering_fields = ["starts_at", "created_at", "title", "status"]
    ordering = ["starts_at"]

    def get_queryset(self):
        queryset = (
            LiveSession.objects.select_related("created_by", "course")
            .prefetch_related("assigned_teachers", "enrollments")
            .all()
        )

        session_type = self.request.query_params.get("type")
        if session_type:
            if session_type not in LiveSession.SessionType.values:
                raise serializers.ValidationError(
                    {"type": "Le type doit être 'course' ou 'training'."}
                )
            queryset = queryset.filter(session_type=session_type)

        session_status = self.request.query_params.get("status")
        if session_status:
            if session_status not in LiveSession.Status.values:
                raise serializers.ValidationError(
                    {"status": "Statut invalide."}
                )
            queryset = queryset.filter(status=session_status)

        # Filtres de plage de dates pour le calendrier
        starts_after = self.request.query_params.get("starts_after")
        if starts_after:
            queryset = queryset.filter(starts_at__gte=starts_after)

        starts_before = self.request.query_params.get("starts_before")
        if starts_before:
            queryset = queryset.filter(starts_at__lte=starts_before)

        # Un teacher ne voit que ses propres sessions + les formations où il est assigné
        user = self.request.user
        if user.role == User.Role.TEACHER:
            queryset = queryset.filter(
                created_by=user
            ) | queryset.filter(assigned_teachers=user)
            queryset = queryset.distinct()

        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @method_decorator(csrf_protect)
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @method_decorator(csrf_protect)
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @method_decorator(csrf_protect)
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @method_decorator(csrf_protect)
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)

    @action(
        detail=False,
        methods=["get"],
        url_path="recommended",
        url_name="recommended",
        permission_classes=[IsAuthenticated],
    )
    def recommended(self, request):
        """Sessions à venir suggérées à un étudiant, calculées sur place."""
        if request.user.role != User.Role.STUDENT:
            return Response(
                {"detail": "Les recommandations sont réservées aux étudiants."},
                status=status.HTTP_403_FORBIDDEN,
            )

        raw_limit = request.query_params.get("limit", "6")
        try:
            limit = int(raw_limit)
        except (TypeError, ValueError):
            return Response(
                {"limit": "Le nombre de recommandations doit être un entier."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not 1 <= limit <= 20:
            return Response(
                {"limit": "Le nombre de recommandations doit être entre 1 et 20."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = []
        for recommendation in recommend_sessions_for(request.user, limit=limit):
            data = LiveSessionSerializer(
                recommendation.session, context={"request": request}
            ).data
            data["match_score"] = recommendation.score
            data["recommendation_reason"] = recommendation.reason
            payload.append(data)
        return Response(payload)

    @action(
        detail=False,
        methods=["get"],
        url_path="enrollment-forecast",
        url_name="enrollment-forecast",
        permission_classes=[IsAuthenticated],
    )
    def enrollment_forecast(self, request):
        """Prévision locale du nombre d'inscrits pour les prochaines sessions."""
        if request.user.role not in (User.Role.ADMIN, User.Role.TEACHER):
            return Response(
                {"detail": "Les prévisions sont réservées aux enseignants et administrateurs."},
                status=status.HTTP_403_FORBIDDEN,
            )

        raw_limit = request.query_params.get("limit", "5")
        try:
            limit = int(raw_limit)
        except (TypeError, ValueError):
            return Response(
                {"limit": "La limite doit être un entier."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not 1 <= limit <= 20:
            return Response(
                {"limit": "La limite doit être entre 1 et 20."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = []
        for session, forecast in forecast_upcoming(self.get_queryset(), limit=limit):
            payload.append(
                {
                    "session": LiveSessionSerializer(
                        session, context={"request": request}
                    ).data,
                    "forecast": asdict(forecast),
                }
            )
        return Response(payload)

    @action(
        detail=False,
        methods=["get"],
        url_path="best-times",
        url_name="best-times",
        permission_classes=[IsAuthenticated],
    )
    def best_times(self, request):
        """Créneaux historiquement les plus remplis, calculés localement."""
        if request.user.role not in (User.Role.ADMIN, User.Role.TEACHER):
            return Response(
                {"detail": "Les créneaux suggérés sont réservés aux enseignants et administrateurs."},
                status=status.HTTP_403_FORBIDDEN,
            )

        sessions = self.get_queryset().filter(starts_at__lt=timezone.now())
        slots = best_time_slots(sessions=sessions)
        return Response(
            {
                "sample_size": len(sessions),
                "slots": [asdict(slot) for slot in slots],
            }
        )

    @action(
        detail=False,
        methods=["get"],
        url_path="calendar",
        url_name="calendar",
    )
    def calendar(self, request):
        """Retourne toutes les sessions d'une plage de dates sans pagination (pour le calendrier)."""
        queryset = self.get_queryset().filter(
            status__in=[
                LiveSession.Status.SCHEDULED,
                LiveSession.Status.ONGOING,
            ]
        )
        serializer = LiveSessionSerializer(
            queryset, many=True, context={"request": request}
        )
        return Response(serializer.data)

    @action(
        detail=True,
        methods=["patch"],
        url_path="status",
        permission_classes=[IsAuthenticated, IsAdminRole],
    )
    @method_decorator(csrf_protect)
    def update_status(self, request, pk=None):
        session = self.get_object()
        new_status = request.data.get("status")
        if new_status not in LiveSession.Status.values:
            return Response(
                {"status": "Statut invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        session.status = new_status
        session.save(update_fields=["status", "updated_at"])
        return Response(LiveSessionSerializer(session, context={"request": request}).data)

    @action(
        detail=True,
        methods=["get"],
        url_path="enrollments",
        permission_classes=[IsAuthenticated, IsAdminRole],
    )
    def list_enrollments(self, request, pk=None):
        session = self.get_object()
        enrollments = session.enrollments.select_related("student").all()
        serializer = SessionEnrollmentSerializer(
            enrollments, many=True, context={"request": request}
        )
        return Response(serializer.data)


class SessionEnrollmentViewSet(viewsets.ModelViewSet):
    serializer_class = SessionEnrollmentSerializer
    permission_classes = [IsAuthenticated, CanManageEnrollment]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        queryset = SessionEnrollment.objects.select_related("session", "student").all()

        if user.role != User.Role.ADMIN:
            queryset = queryset.filter(student=user)

        session_id = self.request.query_params.get("session")
        if session_id:
            queryset = queryset.filter(session_id=session_id)

        return queryset

    def perform_create(self, serializer):
        serializer.save(student=self.request.user)

    @method_decorator(csrf_protect)
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @method_decorator(csrf_protect)
    def update(self, request, *args, **kwargs):
        if request.user.role != User.Role.ADMIN:
            return Response(
                {"detail": "Seul un administrateur peut modifier le statut d'une inscription."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)

    @method_decorator(csrf_protect)
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)
