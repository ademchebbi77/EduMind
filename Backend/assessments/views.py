import logging
from pathlib import Path

from django.conf import settings
from django.db.models import (
    Case,
    Count,
    IntegerField,
    Max,
    OuterRef,
    Q,
    QuerySet,
    Subquery,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from kombu.exceptions import OperationalError as KombuOperationalError
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, Throttled
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from courses.file_serving import build_file_response
from courses.models import Course

from .models import (
    DIFFICULTY_RANK,
    Difficulty,
    Exercise,
    ExerciseSubmission,
    Question,
    Quiz,
    QuizAttempt,
    QuizGenerationJob,
)
from .generation.keywords import available_engine
from .generation.service import (
    ACTIVE_STATUSES,
    compute_metrics,
    expire_if_stale,
    humanize_filename,
)
from .permissions import CanManageAssessment, IsStudent, IsTeacherOrAdmin, can_manage_course
from .serializers import (
    ExerciseDetailSerializer,
    ExerciseSerializer,
    ExerciseSubmissionSerializer,
    GradeSubmissionSerializer,
    PublicQuizSerializer,
    QuizAttemptResultSerializer,
    QuizAttemptSerializer,
    QuizGenerationJobSerializer,
    QuizGenerationRequestSerializer,
    QuizListSerializer,
    QuizSerializer,
    QuizSubmissionSerializer,
    SubmissionContentSerializer,
    course_text_status,
)
from .services import attempts_used, start_attempt, submit_attempt

logger = logging.getLogger(__name__)

DIFFICULTY_ORDER = Case(
    *(When(difficulty=value, then=Value(rank)) for value, rank in DIFFICULTY_RANK.items()),
    output_field=IntegerField(),
)


def _subquery_value(queryset, field):
    return Subquery(queryset.values(field)[:1])


class AssessmentQuerysetMixin:
    """Shared visibility rules and filters for quizzes and exercises.

    Students only see published items. Teachers also see drafts of the courses
    they own, and admins see everything.
    """

    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["title", "description"]
    ordering_fields = ["title", "created_at", "updated_at", "difficulty_rank"]
    ordering = ["-created_at"]

    def visible(self, queryset):
        user = self.request.user
        if user.role == User.Role.ADMIN:
            return queryset
        if user.role == User.Role.TEACHER:
            return queryset.filter(Q(is_published=True) | Q(course__owner=user))
        return queryset.filter(is_published=True)

    def apply_filters(self, queryset):
        params = self.request.query_params

        course_id = self.kwargs.get("course_id")
        if course_id is not None:
            # Nested route: an unknown course is a missing resource.
            get_object_or_404(Course, pk=course_id)
            queryset = queryset.filter(course_id=course_id)
        elif params.get("course"):
            raw = params["course"]
            if not raw.isdigit() or not Course.objects.filter(pk=raw).exists():
                raise serializers.ValidationError({"course": "This course does not exist."})
            queryset = queryset.filter(course_id=raw)

        difficulty = params.get("difficulty")
        if difficulty:
            if difficulty not in Difficulty.values:
                raise serializers.ValidationError(
                    {"difficulty": "The difficulty must be beginner, intermediate or advanced."}
                )
            queryset = queryset.filter(difficulty=difficulty)

        published = params.get("is_published")
        if published in {"true", "false"}:
            queryset = queryset.filter(is_published=published == "true")
        elif published:
            raise serializers.ValidationError({"is_published": "Use “true” or “false”."})

        return queryset.annotate(difficulty_rank=DIFFICULTY_ORDER)

    def is_manager(self, obj):
        return can_manage_course(self.request.user, obj.course)

    def require_manager(self, obj):
        if not self.is_manager(obj):
            raise PermissionDenied()


class QuizViewSet(AssessmentQuerysetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanManageAssessment]
    student_actions = ("start", "submit")

    def get_permissions(self):
        if self.action in self.student_actions:
            return [IsAuthenticated(), IsStudent()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == "list":
            return QuizListSerializer
        return QuizSerializer

    def get_queryset(self) -> QuerySet[Quiz]:
        queryset = self.visible(Quiz.objects.select_related("course"))
        if self.action != "list":
            return queryset.prefetch_related("questions__options")

        user = self.request.user
        questions = Question.objects.filter(quiz=OuterRef("pk")).values("quiz")
        own_attempts = QuizAttempt.objects.filter(
            quiz=OuterRef("pk"), student=user
        ).values("quiz")
        closed_attempts = QuizAttempt.objects.filter(quiz=OuterRef("pk")).exclude(
            status=QuizAttempt.Status.IN_PROGRESS
        ).values("quiz")

        queryset = queryset.annotate(
            question_count=Coalesce(
                _subquery_value(questions.annotate(n=Count("id")), "n"), 0
            ),
            total_points=Coalesce(
                _subquery_value(questions.annotate(n=Sum("points")), "n"), 0
            ),
            attempt_count=Coalesce(
                _subquery_value(closed_attempts.annotate(n=Count("id")), "n"), 0
            ),
            my_attempt_count=Coalesce(
                _subquery_value(own_attempts.annotate(n=Count("id")), "n"), 0
            ),
            my_best_percentage=_subquery_value(
                own_attempts.exclude(status=QuizAttempt.Status.IN_PROGRESS).annotate(
                    n=Max("percentage")
                ),
                "n",
            ),
        )
        return self.apply_filters(queryset)

    def retrieve(self, request, *args, **kwargs):
        quiz = self.get_object()
        if self.is_manager(quiz):
            return Response(QuizSerializer(quiz, context=self.get_serializer_context()).data)
        return Response(self._public_quiz(quiz))

    def _public_quiz(self, quiz):
        data = PublicQuizSerializer(quiz, context=self.get_serializer_context()).data
        if self.request.user.role == User.Role.STUDENT:
            data["my_attempt_count"] = attempts_used(quiz, self.request.user)
            best = (
                quiz.attempts.filter(student=self.request.user)
                .exclude(status=QuizAttempt.Status.IN_PROGRESS)
                .aggregate(best=Max("percentage"))["best"]
            )
            data["my_best_percentage"] = float(best) if best is not None else None
        return data

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        quiz = self.get_object()
        attempt, created = start_attempt(quiz, request.user)
        return Response(
            {
                "attempt": QuizAttemptSerializer(attempt).data,
                "server_time": timezone.now(),
                "quiz": self._public_quiz(quiz),
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        quiz = self.get_object()
        payload = QuizSubmissionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        attempt = submit_attempt(quiz, request.user, payload.validated_data["answers"])
        return Response(QuizAttemptResultSerializer(attempt).data)

    def _attempts_for(self, quiz):
        attempts = quiz.attempts.select_related("quiz", "student")
        if self.is_manager(quiz):
            return attempts, True
        return attempts.filter(student=self.request.user), False

    @action(detail=True, methods=["get"])
    def attempts(self, request, pk=None):
        quiz = self.get_object()
        attempts, _ = self._attempts_for(quiz)
        page = self.paginate_queryset(attempts)
        data = QuizAttemptSerializer(page, many=True).data
        return self.get_paginated_response(data)

    @action(
        detail=True,
        methods=["get"],
        url_path=r"attempts/(?P<attempt_id>[0-9]+)",
        url_name="attempt-detail",
    )
    def attempt_detail(self, request, pk=None, attempt_id=None):
        quiz = self.get_object()
        attempts, is_manager = self._attempts_for(quiz)
        attempt = attempts.filter(pk=attempt_id).first()
        if attempt is None:
            raise NotFound()
        serializer = QuizAttemptResultSerializer(attempt, context={"is_manager": is_manager})
        return Response(serializer.data)


class ExerciseViewSet(AssessmentQuerysetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanManageAssessment]
    student_actions = ("submission",)

    def get_permissions(self):
        if self.action in self.student_actions:
            return [IsAuthenticated(), IsStudent()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ExerciseDetailSerializer
        return ExerciseSerializer

    def get_queryset(self) -> QuerySet[Exercise]:
        queryset = self.visible(Exercise.objects.select_related("course"))
        if self.action not in {"list", "retrieve"}:
            return queryset

        user = self.request.user
        own = ExerciseSubmission.objects.filter(exercise=OuterRef("pk"), student=user)
        queryset = queryset.annotate(
            submission_count=Count("submissions", distinct=True),
            graded_count=Count(
                "submissions",
                filter=Q(submissions__graded_at__isnull=False),
                distinct=True,
            ),
            my_submission_id=_subquery_value(own, "id"),
            my_graded_at=_subquery_value(own, "graded_at"),
            my_score=_subquery_value(own, "score"),
        )
        return self.apply_filters(queryset)

    def _attachment_response(self, request, as_attachment):
        exercise = self.get_object()
        if not exercise.attachment:
            raise NotFound()
        stem = Path(exercise.attachment_name).stem if exercise.attachment_name else exercise.title
        extension = Path(exercise.attachment.name).suffix.lower()
        filename = f"{slugify(stem)[:80] or 'exercise'}{extension}"
        return build_file_response(request, exercise.attachment, filename, as_attachment)

    @action(detail=True, methods=["get"], url_path="attachment", url_name="attachment")
    def attachment(self, request, pk=None):
        return self._attachment_response(request, as_attachment=False)

    @action(
        detail=True,
        methods=["get"],
        url_path="attachment/download",
        url_name="attachment-download",
    )
    def attachment_download(self, request, pk=None):
        return self._attachment_response(request, as_attachment=True)

    @action(detail=True, methods=["put"])
    def submission(self, request, pk=None):
        exercise = self.get_object()
        payload = SubmissionContentSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        submission = ExerciseSubmission.objects.filter(
            exercise=exercise, student=request.user
        ).first()
        if submission is not None and submission.is_graded:
            raise serializers.ValidationError(
                {"content": "This submission has already been graded and can no longer be changed."}
            )

        created = submission is None
        if created:
            submission = ExerciseSubmission(exercise=exercise, student=request.user)
        submission.content = payload.validated_data["content"]
        submission.save()
        return Response(
            ExerciseSubmissionSerializer(submission).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get"])
    def submissions(self, request, pk=None):
        exercise = self.get_object()
        self.require_manager(exercise)
        queryset = exercise.submissions.select_related("student", "graded_by", "exercise")
        page = self.paginate_queryset(queryset)
        data = ExerciseSubmissionSerializer(page, many=True).data
        return self.get_paginated_response(data)

    @action(
        detail=True,
        methods=["patch"],
        url_path=r"submissions/(?P<submission_id>[0-9]+)",
        url_name="grade-submission",
    )
    def grade_submission(self, request, pk=None, submission_id=None):
        exercise = self.get_object()
        self.require_manager(exercise)
        submission = exercise.submissions.filter(pk=submission_id).first()
        if submission is None:
            raise NotFound()

        payload = GradeSubmissionSerializer(
            data=request.data, context={"exercise": exercise}
        )
        payload.is_valid(raise_exception=True)
        submission.score = payload.validated_data["score"]
        submission.feedback = payload.validated_data.get("feedback", "").strip()
        submission.graded_by = request.user
        submission.graded_at = timezone.now()
        submission.save()
        return Response(ExerciseSubmissionSerializer(submission).data)


# --- Local quiz generator --------------------------------------------------------


class GeneratorUnavailable(APIException):
    status_code = 503
    default_code = "generator_unavailable"
    default_detail = (
        "The background worker is unavailable. Start Redis and the Celery worker, "
        "then try again."
    )


def _generation_jobs(user):
    jobs = QuizGenerationJob.objects.select_related("course")
    return jobs if user.role == User.Role.ADMIN else jobs.filter(requested_by=user)


def _enqueue(job):
    """Hand the job to Celery; fail it immediately if the broker is unreachable."""
    from .tasks import generate_quiz_task

    try:
        generate_quiz_task.apply_async(args=[str(job.pk)], retry=False)
    except (KombuOperationalError, OSError) as error:
        logger.warning("Quiz generation broker unavailable: %s", error)
        job.status = QuizGenerationJob.Status.FAILED
        job.stage = QuizGenerationJob.Stage.FAILED
        job.error_message = GeneratorUnavailable.default_detail
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "stage", "error_message", "finished_at"])
        if job.source_file:
            job.source_file.delete(save=True)
        raise GeneratorUnavailable() from error


def _course_from_upload(request, upload):
    """Create a course from an uploaded PDF with the course module's own serializer."""
    from courses.serializers import CourseSerializer

    upload.seek(0)
    serializer = CourseSerializer(
        data={"title": humanize_filename(upload.name)[:200], "file": upload},
        context={"request": request},
    )
    if not serializer.is_valid():
        messages = [str(message) for errors in serializer.errors.values() for message in errors]
        raise serializers.ValidationError({"file": messages or ["This PDF cannot become a course."]})
    return serializer.save(owner=request.user)


class QuizGenerationViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """Start local quiz generation jobs and follow their progress."""

    permission_classes = [IsAuthenticated, IsTeacherOrAdmin]
    serializer_class = QuizGenerationJobSerializer

    def get_queryset(self):
        return _generation_jobs(self.request.user)

    def create(self, request, *args, **kwargs):
        payload = QuizGenerationRequestSerializer(data=request.data, context={"request": request})
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        active = QuizGenerationJob.objects.filter(
            requested_by=request.user, status__in=ACTIVE_STATUSES
        )
        still_active = [job for job in active if expire_if_stale(job).status in ACTIVE_STATUSES]
        if len(still_active) >= settings.QUIZ_GENERATION_MAX_ACTIVE_JOBS:
            raise Throttled(detail="Wait for your current quiz generations to finish.")

        course, upload = data.get("course"), data.get("file")
        created_course = None
        if data["create_course"]:
            # The PDF becomes a regular course; the job then reads that course.
            created_course = course = _course_from_upload(request, upload)
            upload = None
        job = QuizGenerationJob(
            requested_by=request.user,
            course=course,
            source_name=(Path(upload.name).name if upload else course.title)[:255],
            num_questions=data["num_questions"],
            difficulty=data["difficulty"],
            question_types=data["question_types"],
        )
        if upload is not None:
            job.source_file.save(upload.name, upload, save=False)
        job.save()
        try:
            _enqueue(job)
        except GeneratorUnavailable:
            if created_course is not None:
                created_course.delete()  # nothing half-done when the worker is down
            raise
        job.refresh_from_db()  # already finished when tasks run eagerly
        return Response(self.get_serializer(job).data, status=status.HTTP_202_ACCEPTED)

    def retrieve(self, request, *args, **kwargs):
        job = expire_if_stale(self.get_object())
        return Response(self.get_serializer(job).data)


class QuizGenerationSourcesView(APIView):
    """Courses the current user may generate a quiz from."""

    permission_classes = [IsAuthenticated, IsTeacherOrAdmin]

    def get(self, request):
        courses = Course.objects.select_related("transcript").order_by("title")
        if request.user.role != User.Role.ADMIN:
            courses = courses.filter(owner=request.user)
        results = []
        for course in courses:
            available, reason = course_text_status(course)
            results.append(
                {
                    "id": course.pk,
                    "title": course.title,
                    "type": course.type,
                    "available": available,
                    "reason": reason,
                }
            )
        return Response({"results": results})


class QuizGenerationMetricsView(APIView):
    """Quality and performance metrics of the generator (own jobs; all for admins)."""

    permission_classes = [IsAuthenticated, IsTeacherOrAdmin]

    def get(self, request):
        metrics = compute_metrics(_generation_jobs(request.user))
        metrics["engine"] = {language: available_engine(language) for language in ("fr", "en")}
        return Response(metrics)
