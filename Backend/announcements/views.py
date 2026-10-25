from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User
from accounts.permissions import IsAdminRole

from .categorization import CATEGORY_KEYS, CATEGORY_LABELS, categorize
from .models import Announcement, AnnouncementEnrollment
from .permissions import CanManageAnnouncement
from .serializers import AnnouncementEnrollmentSerializer, AnnouncementSerializer


class AnnouncementViewSet(viewsets.ModelViewSet):
    serializer_class = AnnouncementSerializer
    permission_classes = [IsAuthenticated, CanManageAnnouncement]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["title", "content"]
    ordering_fields = ["created_at", "is_pinned", "title"]
    ordering = ["-is_pinned", "-created_at"]

    def get_queryset(self):
        user = self.request.user
        queryset = Announcement.objects.select_related(
            "author", "related_session"
        ).prefetch_related("enrollments").all()

        if user.role == User.Role.STUDENT:
            queryset = queryset.filter(
                target_audience__in=[
                    Announcement.TargetAudience.ALL,
                    Announcement.TargetAudience.STUDENTS,
                ]
            )
        elif user.role == User.Role.TEACHER:
            queryset = queryset.filter(
                target_audience__in=[
                    Announcement.TargetAudience.ALL,
                    Announcement.TargetAudience.TEACHERS,
                ]
            )

        category = self.request.query_params.get("category")
        if category:
            if category not in CATEGORY_KEYS:
                raise ValidationError({"category": "Catégorie inconnue."})
            matching_ids = [
                announcement.pk
                for announcement in queryset
                if categorize(announcement).key == category
            ]
            queryset = queryset.filter(pk__in=matching_ids)

        return queryset

    @action(detail=False, methods=["get"], url_path="categories")
    def categories(self, request):
        """Liste les catégories disponibles (calculées localement)."""
        return Response(
            [{"key": key, "label": label} for key, label in CATEGORY_LABELS.items()]
        )

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

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

    @action(detail=True, methods=["get"], url_path="enrollments",
            permission_classes=[IsAuthenticated, IsAdminRole])
    def list_enrollments(self, request, pk=None):
        """Liste les inscriptions à cette annonce (admin seulement)."""
        announcement = self.get_object()
        enrollments  = announcement.enrollments.select_related("student").all()
        serializer   = AnnouncementEnrollmentSerializer(
            enrollments, many=True, context={"request": request}
        )
        return Response(serializer.data)

    @action(detail=True, methods=["patch"], url_path="enrollments/(?P<enrollment_pk>[^/.]+)/status",
            permission_classes=[IsAuthenticated, IsAdminRole])
    @method_decorator(csrf_protect)
    def update_enrollment_status(self, request, pk=None, enrollment_pk=None):
        """Change le statut d'une inscription (admin seulement)."""
        try:
            enrollment = AnnouncementEnrollment.objects.get(
                pk=enrollment_pk, announcement_id=pk
            )
        except AnnouncementEnrollment.DoesNotExist:
            return Response({"detail": "Inscription introuvable."}, status=status.HTTP_404_NOT_FOUND)
        new_status = request.data.get("status")
        if new_status not in AnnouncementEnrollment.Status.values:
            return Response({"status": "Statut invalide."}, status=status.HTTP_400_BAD_REQUEST)
        enrollment.status = new_status
        enrollment.save(update_fields=["status", "updated_at"])
        return Response(AnnouncementEnrollmentSerializer(enrollment).data)


class AnnouncementEnrollmentViewSet(viewsets.ModelViewSet):
    serializer_class   = AnnouncementEnrollmentSerializer
    permission_classes = [IsAuthenticated]
    http_method_names  = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        user    = self.request.user
        queryset = AnnouncementEnrollment.objects.select_related(
            "announcement", "student"
        ).all()
        if user.role != User.Role.ADMIN:
            queryset = queryset.filter(student=user)
        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        serializer.save(
            student=user,
            full_name=serializer.validated_data.get("full_name") or user.get_full_name() or user.email,
            email=serializer.validated_data.get("email") or user.email,
        )

    @method_decorator(csrf_protect)
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @method_decorator(csrf_protect)
    def update(self, request, *args, **kwargs):
        if request.user.role != User.Role.ADMIN:
            return Response(
                {"detail": "Seul un administrateur peut modifier le statut."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)

    @method_decorator(csrf_protect)
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)
