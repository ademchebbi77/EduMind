import logging
import time
from pathlib import Path

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, Exists, F, Max, OuterRef, Q
from django.http import FileResponse
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, NotFound, PermissionDenied
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User

from .content_analyzer import (
    ContentAnalysisError,
    analyze_bulk_lessons as analyze_bulk_lesson_files,
    analyze_course,
    analyze_upload,
)
from .file_serving import (
    build_course_file_response,
    build_lesson_file_response,
)
from .ml_recommendations import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    popular_course_recommendations,
    recommend_courses,
)
from .models import (
    Category,
    Course,
    CourseProgress,
    CourseTranscript,
    Enrollment,
    Lesson,
)
from .permissions import CanManageCategory, CanManageCourse, CanManageEnrollment
from .progress import get_or_create_progress, record_progress
from .serializers import (
    BulkLessonAnalysisSerializer,
    CategorySerializer,
    CourseContentAnalysisSerializer,
    CourseProgressSerializer,
    CourseProgressUpdateSerializer,
    CourseSerializer,
    CourseTranscriptRequestSerializer,
    CourseTranscriptSerializer,
    EnrollmentSerializer,
    LessonCompleteSerializer,
    LessonReorderSerializer,
    LessonSerializer,
)
from .throttling import check_bulk_lesson_analysis_throttle
from .transcripts import (
    enqueue_transcript,
    fail_stale_transcript,
    transcript_is_stale,
)
from .validators import THUMBNAIL_CONTENT_TYPES

logger = logging.getLogger(__name__)


class TranscriptServiceUnavailable(APIException):
    status_code = 503
    default_detail = "Transcript generation is not available."
    default_code = "transcript_unavailable"


class RecommendationServiceUnavailable(APIException):
    status_code = 503
    default_detail = "Recommendations are temporarily unavailable."
    default_code = "recommendations_unavailable"


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

        queryset = queryset.annotate(
            lesson_count=Count("lessons", distinct=True),
            published_lesson_count=Count(
                "lessons", filter=Q(lessons__is_published=True), distinct=True
            ),
        )
        if user.is_authenticated and user.role == User.Role.STUDENT:
            queryset = queryset.annotate(
                completed_lessons_count=Count(
                    "lessons__completions",
                    filter=Q(
                        lessons__completions__student=user,
                        lessons__completions__completed=True,
                    ),
                    distinct=True,
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

        difficulty = self.request.query_params.get("difficulty")
        if difficulty:
            if difficulty not in Course.Difficulty.values:
                raise serializers.ValidationError(
                    {
                        "difficulty": (
                            "The difficulty must be “beginner”, "
                            "“intermediate” or “advanced”."
                        )
                    }
                )
            queryset = queryset.filter(difficulty=difficulty)

        tags = self.request.query_params.get("tags")
        if tags:
            for tag in (item.strip() for item in tags.split(",")):
                if tag:
                    queryset = queryset.filter(tags__icontains=tag)

        return queryset

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        course = self.get_object()
        context = self.get_serializer_context()
        context["include_lessons"] = True
        if request.user.role == User.Role.STUDENT:
            context["lesson_statuses"] = course.lesson_progress_for(
                request.user
            )["statuses"]
        return Response(CourseSerializer(course, context=context).data)

    @action(
        detail=False,
        methods=["post"],
        url_path="analyze-content",
        url_name="analyze-content",
    )
    def analyze_content(self, request):
        payload = CourseContentAnalysisSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        upload = payload.validated_data.get("file")
        course_id = payload.validated_data.get("course_id")

        try:
            if upload is not None:
                result = analyze_upload(upload)
            else:
                course = Course.objects.filter(pk=course_id).first()
                if course is None:
                    raise NotFound("This course does not exist.")
                if (
                    request.user.role != User.Role.ADMIN
                    and course.owner_id != request.user.id
                ):
                    raise PermissionDenied(
                        "You can only analyze courses you own."
                    )
                result = analyze_course(course)
        except ContentAnalysisError as error:
            raise serializers.ValidationError(
                {"file": [str(error)]}
            ) from error

        return Response(result)

    @action(
        detail=False,
        methods=["post"],
        url_path="analyze-bulk-lessons",
        url_name="analyze-bulk-lessons",
    )
    def analyze_bulk_lessons(self, request):
        payload = BulkLessonAnalysisSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        check_bulk_lesson_analysis_throttle(request.user.id)
        return Response(
            analyze_bulk_lesson_files(payload.validated_data["files"])
        )

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

    @action(
        detail=False,
        methods=["get"],
        url_path="ml-recommendations",
        url_name="ml-recommendations",
        permission_classes=[IsAuthenticated],
    )
    def ml_recommendations(self, request):
        if request.user.role != User.Role.STUDENT:
            raise PermissionDenied(
                "Only students receive course recommendations."
            )

        raw_limit = request.query_params.get("limit", DEFAULT_LIMIT)
        try:
            limit = int(raw_limit)
        except (TypeError, ValueError):
            raise serializers.ValidationError(
                {"limit": "The limit must be a whole number."}
            )
        if not 1 <= limit <= MAX_LIMIT:
            raise serializers.ValidationError(
                {
                    "limit": (
                        f"The limit must be between 1 and {MAX_LIMIT}."
                    )
                }
            )

        started = time.perf_counter()
        enrolled_ids = list(
            Enrollment.objects.filter(student_id=request.user.id).values_list(
                "course_id", flat=True
            )
        )
        algorithm = "hybrid" if enrolled_ids else "popular"

        try:
            items = recommend_courses(
                request.user.id,
                limit=limit,
                exclude_ids=enrolled_ids,
            )
        except Exception:
            logger.exception(
                "Recommendation engine failed for student %s", request.user.id
            )
            algorithm = "popular"
            try:
                items = popular_course_recommendations(
                    request.user.id, limit
                )
            except Exception:
                logger.exception(
                    "Popular recommendation fallback failed for student %s",
                    request.user.id,
                )
                raise RecommendationServiceUnavailable()

        courses = {
            course.pk: course
            for course in Course.objects.select_related(
                "owner", "category"
            ).filter(pk__in=[item["course_id"] for item in items])
        }

        recommendations = []
        for item in items:
            course = courses.get(item["course_id"])
            if course is None:
                continue
            course.is_enrolled = False
            data = CourseSerializer(
                course, context={"request": request}
            ).data
            data["category_id"] = data.get("category")
            data["category"] = data.get("category_name")
            data["confidence"] = item["confidence"]
            data["reason"] = item["reason"]
            recommendations.append(data)

        return Response(
            {
                "recommendations": recommendations,
                "algorithm": algorithm,
                "computed_in_ms": round(
                    (time.perf_counter() - started) * 1000, 2
                ),
            }
        )


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


def _shift_lesson_orders(course, start_order, delta, exclude=None):
    """Move every lesson with order >= start_order by delta, bottom-up or
    top-down so the unique (course, order) constraint never collides."""
    lessons = course.lessons.filter(order__gte=start_order)
    if exclude is not None:
        lessons = lessons.exclude(pk=exclude)
    ordering = "-order" if delta > 0 else "order"
    for lesson in lessons.order_by(ordering):
        lesson.order += delta
        lesson.save(update_fields=["order"])


class LessonViewSet(viewsets.ModelViewSet):
    serializer_class = LessonSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = [
        "get",
        "post",
        "put",
        "patch",
        "delete",
        "head",
        "options",
    ]

    def get_queryset(self):
        return Lesson.objects.filter(
            course_id=self.kwargs["course_id"]
        ).select_related("course")

    def _get_course(self):
        course = Course.objects.filter(
            pk=self.kwargs["course_id"]
        ).first()
        if course is None:
            raise NotFound("This course does not exist.")
        return course

    def _can_manage(self, course):
        user = self.request.user
        if user.role == User.Role.ADMIN:
            return True
        return (
            user.role == User.Role.TEACHER
            and course.owner_id == user.id
        )

    def _require_management(self, course):
        if not self._can_manage(course):
            raise PermissionDenied(
                "You can only manage the lessons of your own courses."
            )

    def _require_enrolled(self, course, user):
        if user.role != User.Role.STUDENT:
            raise PermissionDenied("Only students can access lessons.")
        if not course.enrollments.filter(student=user).exists():
            raise PermissionDenied(
                "You must be enrolled in this course to access its lessons."
            )

    def list(self, request, *args, **kwargs):
        course = self._get_course()
        if self._can_manage(course):
            lessons = self.get_queryset()
            serializer = self.get_serializer(lessons, many=True)
            return Response(serializer.data)

        self._require_enrolled(course, request.user)
        lessons = list(self.get_queryset().filter(is_published=True))
        summary = course.lesson_progress_for(request.user)
        context = dict(self.get_serializer_context())
        context["lesson_statuses"] = summary["statuses"]
        serializer = LessonSerializer(lessons, many=True, context=context)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        course = self._get_course()
        self._require_management(course)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            max_order = (
                course.lessons.aggregate(Max("order"))["order__max"] or 0
            )
            order = serializer.validated_data.get("order")
            if order is None or order > max_order + 1:
                order = max_order + 1
            else:
                _shift_lesson_orders(course, order, 1)
            lesson = serializer.save(course=course, order=order)

        return Response(
            LessonSerializer(lesson, context=self.get_serializer_context()).data,
            status=201,
        )

    def _require_lesson_management(self, course):
        self._require_management(course)
        return self.get_object()

    def update(self, request, *args, **kwargs):
        course = self._get_course()
        self._require_management(course)
        lesson = self.get_object()

        serializer = self.get_serializer(
            lesson, data=request.data, partial=request.method == "PATCH"
        )
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            new_order = serializer.validated_data.get("order", lesson.order)
            if new_order != lesson.order:
                _shift_lesson_orders(course, lesson.order + 1, -1)
                max_order = (
                    course.lessons.exclude(pk=lesson.pk).aggregate(
                        Max("order")
                    )["order__max"]
                    or 0
                )
                new_order = min(new_order, max_order + 1)
                _shift_lesson_orders(course, new_order, 1, exclude=lesson.pk)
            lesson = serializer.save(order=new_order)

        return Response(
            LessonSerializer(lesson, context=self.get_serializer_context()).data
        )

    def destroy(self, request, *args, **kwargs):
        course = self._get_course()
        self._require_management(course)
        lesson = self.get_object()

        with transaction.atomic():
            order = lesson.order
            lesson.delete()
            _shift_lesson_orders(course, order + 1, -1)

        return Response(status=204)

    @action(
        detail=False,
        methods=["post"],
        url_path="reorder",
        url_name="reorder",
    )
    def reorder(self, request, course_id=None):
        course = self._get_course()
        self._require_management(course)

        payload = LessonReorderSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        lesson_ids = payload.validated_data["lesson_ids"]

        existing_ids = set(
            course.lessons.values_list("pk", flat=True)
        )
        if len(set(lesson_ids)) != len(lesson_ids):
            raise serializers.ValidationError(
                {"lesson_ids": "Duplicate lesson IDs are not allowed."}
            )
        if set(lesson_ids) != existing_ids:
            raise serializers.ValidationError(
                {
                    "lesson_ids": (
                        "The list must contain exactly the IDs of all "
                        "lessons of this course."
                    )
                }
            )

        with transaction.atomic():
            lessons_by_id = {
                lesson.pk: lesson for lesson in course.lessons.all()
            }
            offset = max(existing_ids and (max(existing_ids) + 1), 1) + len(
                lesson_ids
            )
            for index, lesson_id in enumerate(lesson_ids, start=offset):
                lesson = lessons_by_id[lesson_id]
                lesson.order = index
                lesson.save(update_fields=["order"])
            for index, lesson_id in enumerate(lesson_ids, start=1):
                lesson = lessons_by_id[lesson_id]
                lesson.order = index
                lesson.save(update_fields=["order"])

        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="file", url_name="file")
    def serve_file(self, request, course_id=None, pk=None):
        course = self._get_course()
        lesson = self.get_object()
        user = request.user

        if not self._can_manage(course):
            self._require_enrolled(course, user)
            if lesson.is_locked_for(user):
                raise PermissionDenied(
                    "Complete the previous lesson first."
                )

        return build_lesson_file_response(
            request, lesson, as_attachment=False
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="complete",
        url_name="complete",
    )
    def complete(self, request, course_id=None, pk=None):
        course = self._get_course()
        lesson = self.get_object()
        user = request.user

        if user.role != User.Role.STUDENT:
            raise PermissionDenied("Only students can complete lessons.")
        enrollment = course.enrollments.filter(student=user).first()
        if enrollment is None:
            raise PermissionDenied(
                "You must be enrolled in this course to complete lessons."
            )
        if not lesson.is_published:
            raise PermissionDenied("This lesson is not available.")
        if lesson.is_locked_for(user):
            raise PermissionDenied("Complete the previous lesson first.")

        payload = LessonCompleteSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        time_spent = payload.validated_data.get("time_spent_seconds") or 0

        completion = lesson.mark_completed(user)
        if time_spent:
            completion.time_spent_seconds += time_spent
            completion.save(update_fields=["time_spent_seconds"])

        summary = course.lesson_progress_for(user)
        course_completed = (
            summary["total_lessons"] > 0
            and summary["completed_lessons"] == summary["total_lessons"]
        )
        if course_completed:
            get_or_create_progress(enrollment).mark_completed()

        published = list(
            course.lessons.filter(is_published=True).order_by("order")
        )
        next_lesson = None
        for index, current in enumerate(published):
            if current.pk == lesson.pk and index + 1 < len(published):
                next_lesson = published[index + 1]
                break

        return Response(
            {
                "is_completed": True,
                "completed_at": completion.completed_at,
                "lesson_id": lesson.pk,
                "next_lesson_id": next_lesson.pk if next_lesson else None,
                "course_completed": course_completed,
                "course_progress": {
                    "total_lessons": summary["total_lessons"],
                    "completed_lessons": summary["completed_lessons"],
                    "locked_lessons": summary["locked_lessons"],
                    "percentage": summary["percentage"],
                },
            }
        )

    @action(
        detail=False,
        methods=["get"],
        url_path="my-progress",
        url_name="my-progress",
    )
    def my_progress(self, request, course_id=None):
        course = self._get_course()
        self._require_enrolled(course, request.user)

        summary = course.lesson_progress_for(request.user)
        lessons = list(
            self.get_queryset().filter(is_published=True)
        )
        context = dict(self.get_serializer_context())
        context["lesson_statuses"] = summary["statuses"]
        serializer = LessonSerializer(lessons, many=True, context=context)

        return Response(
            {
                "total_lessons": summary["total_lessons"],
                "completed_lessons": summary["completed_lessons"],
                "locked_lessons": summary["locked_lessons"],
                "percentage": summary["percentage"],
                "lessons": serializer.data,
            }
        )
