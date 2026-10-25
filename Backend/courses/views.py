from django.db.models import QuerySet
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated

from .file_serving import build_course_file_response
from .models import Course
from .permissions import CanManageCourse
from .serializers import CourseSerializer


class CourseViewSet(viewsets.ModelViewSet):
    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticated, CanManageCourse]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["title", "description"]
    ordering_fields = ["title", "type", "created_at", "updated_at"]
    ordering = ["-created_at"]

    def get_queryset(self) -> QuerySet[Course]:
        queryset = Course.objects.select_related("owner").all()
        course_type = self.request.query_params.get("type")
        if course_type:
            if course_type not in Course.Type.values:
                raise serializers.ValidationError(
                    {"type": "The type must be “pdf” or “audio”."}
                )
            queryset = queryset.filter(type=course_type)
        return queryset

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=["get"], url_path="file", url_name="file")
    def serve_file(self, request, pk=None):
        course = self.get_object()
        return build_course_file_response(request, course, as_attachment=False)

    @action(detail=True, methods=["get"], url_path="download", url_name="download")
    def download(self, request, pk=None):
        course = self.get_object()
        return build_course_file_response(request, course, as_attachment=True)
