from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import filters, viewsets
from rest_framework.permissions import IsAuthenticated

from accounts.models import User

from .models import Announcement
from .permissions import CanManageAnnouncement
from .serializers import AnnouncementSerializer


class AnnouncementViewSet(viewsets.ModelViewSet):
    serializer_class = AnnouncementSerializer
    permission_classes = [IsAuthenticated, CanManageAnnouncement]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["title", "content"]
    ordering_fields = ["created_at", "is_pinned", "title"]
    ordering = ["-is_pinned", "-created_at"]

    def get_queryset(self):
        user = self.request.user
        queryset = Announcement.objects.select_related("author", "related_session").all()

        # Filtrer par audience : chaque utilisateur ne voit que ce qui le concerne
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
        # Admin voit tout

        return queryset

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
