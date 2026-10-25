from pathlib import Path

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Exists, OuterRef
from django.http import FileResponse
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, NotFound, PermissionDenied
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User

from .file_serving import build_course_file_response
from .models import Category, Course, CourseProgress, CourseTranscript, Enrollment
from .permissions import CanManageCategory, CanManageCourse, CanManageEnrollment
from .progress import get_or_create_progress, record_progress
from .serializers import (
    CategorySerializer,
    CourseProgressSerializer,
    CourseProgressUpdateSerializer,
    CourseSerializer,
    CourseTranscriptRequestSerializer,
    CourseTranscriptSerializer,
    EnrollmentSerializer,
)
from .transcripts import (
    enqueue_transcript,
    fail_stale_transcript,
    transcript_is_stale,
)
from .validators import THUMBNAIL_CONTENT_TYPES

class TranscriptServiceUnavailable(APIException):
    status_code = 503
    default_detail = "Transcript generation is not available."
    default_code = "transcript_unavailable"


NO_TRANSCRIPT = {
    "status": "none",
    "status_display": "Not generated",
    "stage": "",
    "stage_display": "",
    "progress": 0,
    "language": "",
    "model_name": "",
    "text": "",
    "formatted_by_ai": False,
    "segment_count": 0,
    "error_message": "",
    "started_at": None,
    "completed_at": None,
    "updated_at": None,
}


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, CanManageCategory]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]
    queryset = Category.objects.all()


class CourseViewSet(viewsets.ModelViewSet):
    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticated, CanManageCourse]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["title", "description", "tags"]
    ordering_fields = [
        "title",
        "type",
        "enrolled_count",
        "created_at",
        "updated_at",
    ]
    ordering = ["-created_at"]

    def get_queryset(self):
        queryset = Course.objects.select_related("owner", "category").all()

        user = self.request.user
        if user.is_authenticated:
            queryset = queryset.annotate(
                is_enrolled=Exists(
                    Enrollment.objects.filter(
                        course=OuterRef("pk"),
                        student=user,
                    )
                )
            )

        course_type = self.request.query_params.get("type")
        if course_type:
            if course_type not in Course.Type.values:
                raise serializers.ValidationError(
                    {
                        "type": (
                            "The type must be “pdf”, “audio” or “video”."
                        )
                    }
                )
            queryset = queryset.filter(type=course_type)

        category_slug = self.request.query_params.get("category")
        if category_slug:
            queryset = queryset.filter(category__slug=category_slug)

        tags = self.request.query_params.get("tags")
        if tags:
            for tag in (item.strip() for item in tags.split(",")):
                if tag:
                    queryset = queryset.filter(tags__icontains=tag)

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

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="progress",
        url_name="progress",
        permission_classes=[IsAuthenticated],
    )
    def progress(self, request, pk=None):
        course = self.get_object()
        if request.user.role != User.Role.STUDENT:
            raise PermissionDenied("Only students have course progress.")

        enrollment = Enrollment.objects.filter(
            course=course, student=request.user
        ).first()
        if enrollment is None:
            raise PermissionDenied("You must be enrolled in this course.")

        course_progress = get_or_create_progress(enrollment)
        if request.method == "POST":
            serializer = CourseProgressUpdateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            record_progress(course_progress, serializer.validated_data)

        return Response(CourseProgressSerializer(course_progress).data)

    @staticmethod
    def _can_generate_transcript(user, course):
        if user.role == User.Role.ADMIN or course.owner_id == user.id:
            return True
        return (
            user.role == User.Role.STUDENT
            and course.enrollments.filter(student=user).exists()
        )

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="transcript",
        url_name="transcript",
        permission_classes=[IsAuthenticated],
    )
    def transcript(self, request, pk=None):
        course = self.get_object()

        if request.method == "GET":
            transcript = getattr(course, "transcript", None)
            if transcript is None:
                return Response(NO_TRANSCRIPT)
            if transcript_is_stale(transcript):
                fail_stale_transcript(transcript)
                transcript.refresh_from_db()
            return Response(CourseTranscriptSerializer(transcript).data)

        if course.type != Course.Type.VIDEO or not course.file:
            raise serializers.ValidationError(
                {
                    "course": (
                        "Transcripts can only be generated for uploaded "
                        "video courses."
                    )
                }
            )
        if not self._can_generate_transcript(request.user, course):
            raise PermissionDenied(
                "You do not have permission to generate this transcript."
            )
        if not settings.COHERE_API_KEY:
            raise TranscriptServiceUnavailable(
                "Transcript generation is not configured on this server."
            )

        payload = CourseTranscriptRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        language = payload.validated_data["language"]

        try:
            transcript, created = CourseTranscript.objects.get_or_create(
                course=course
            )
        except IntegrityError:
            transcript = CourseTranscript.objects.get(course=course)
            created = False

        with transaction.atomic():
            transcript = CourseTranscript.objects.select_for_update().get(
                pk=transcript.pk
            )
            active = transcript.status in {
                CourseTranscript.Status.QUEUED,
                CourseTranscript.Status.PROCESSING,
            }
            stale = transcript_is_stale(transcript)
            if not created and not stale and (
                active or transcript.status == CourseTranscript.Status.COMPLETED
            ):
                return Response(
                    CourseTranscriptSerializer(transcript).data,
                    status=202 if active else 200,
                )

            transcript.status = CourseTranscript.Status.QUEUED
            transcript.stage = CourseTranscript.Stage.QUEUED
            transcript.progress = 0
            transcript.language = language
            transcript.model_name = settings.COHERE_TRANSCRIBE_MODEL
            transcript.text = ""
            transcript.formatted_by_ai = False
            transcript.segment_count = 0
            transcript.error_message = ""
            transcript.requested_by = request.user
            transcript.started_at = None
            transcript.completed_at = None
            transcript.save()

        enqueue_transcript(transcript.pk)
        return Response(
            CourseTranscriptSerializer(transcript).data,
            status=202,
        )

    @action(
        detail=True,
        methods=["get"],
        url_path="thumbnail",
        url_name="thumbnail",
    )
    def serve_thumbnail(self, request, pk=None):
        course = self.get_object()
        thumbnail = course.thumbnail
        if not thumbnail:
            raise NotFound("This course has no thumbnail.")

        try:
            handle = thumbnail.storage.open(thumbnail.name, "rb")
        except (FileNotFoundError, OSError) as error:
            raise NotFound("The thumbnail could not be found.") from error

        extension = Path(thumbnail.name).suffix.lower().lstrip(".")
        response = FileResponse(
            handle,
            content_type=THUMBNAIL_CONTENT_TYPES.get(
                extension, "application/octet-stream"
            ),
        )
        response["Content-Disposition"] = "inline"
        response["Cache-Control"] = "private, no-store"
        return response

    @action(
        detail=True,
        methods=["post"],
        url_path="enroll",
        url_name="enroll",
        permission_classes=[IsAuthenticated],
    )
    def enroll(self, request, pk=None):
        course = self.get_object()
        user = request.user
        if user.role != User.Role.STUDENT:
            raise PermissionDenied("Only students can enroll in courses.")

        with transaction.atomic():
            locked_course = Course.objects.select_for_update().get(pk=course.pk)
            if locked_course.is_full:
                raise serializers.ValidationError(
                    {"course": "This course is full."}
                )
            if Enrollment.objects.filter(
                course=locked_course, student=user
            ).exists():
                raise serializers.ValidationError(
                    {"course": "You are already enrolled in this course."}
                )
            enrollment = Enrollment.objects.create(
                course=locked_course,
                student=user,
            )
            CourseProgress.objects.get_or_create(enrollment=enrollment)

        return Response(
            EnrollmentSerializer(
                enrollment, context={"request": request}
            ).data,
            status=201,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="unenroll",
        url_name="unenroll",
        permission_classes=[IsAuthenticated],
    )
    def unenroll(self, request, pk=None):
        course = self.get_object()
        user = request.user
        if user.role != User.Role.STUDENT:
            raise PermissionDenied("Only students can unenroll from courses.")

        with transaction.atomic():
            deleted, _ = Enrollment.objects.filter(
                course=course, student=user
            ).delete()
            if not deleted:
                raise serializers.ValidationError(
                    {"course": "You are not enrolled in this course."}
                )

        return Response(status=204)

    @action(
        detail=False,
        methods=["get"],
        url_path="my-courses",
        url_name="my-courses",
    )
    def my_courses(self, request):
        queryset = self.filter_queryset(
            self.get_queryset()
            .filter(enrollments__student=request.user)
            .order_by("-enrollments__enrolled_at")
        )
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class EnrollmentViewSet(viewsets.ModelViewSet):
    serializer_class = EnrollmentSerializer
    permission_classes = [IsAuthenticated, CanManageEnrollment]
    filter_backends = [OrderingFilter]
    ordering_fields = ["enrolled_at"]
    ordering = ["-enrolled_at"]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        queryset = Enrollment.objects.select_related(
            "course",
            "course__category",
            "student",
            "course_progress",
        ).all()

        if user.role == User.Role.TEACHER:
            queryset = queryset.filter(course__owner=user)
        elif user.role != User.Role.ADMIN:
            queryset = queryset.filter(student=user)

        course_id = self.request.query_params.get("course")
        if course_id:
            if not str(course_id).isdigit():
                raise serializers.ValidationError(
                    {"course": "The course must be a valid identifier."}
                )
            queryset = queryset.filter(course_id=int(course_id))

        return queryset

    def perform_create(self, serializer):
        enrollment = serializer.save(student=self.request.user)
        CourseProgress.objects.get_or_create(enrollment=enrollment)
