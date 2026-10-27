import logging
from pathlib import Path

from django.conf import settings
from django.utils import timezone
from kombu.exceptions import OperationalError as KombuOperationalError
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied, Throttled
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from accounts.models import User
from courses.file_serving import build_file_response

from .jobs import expire_if_stale
from .models import CourseComment, VoiceQuestion
from .permissions import can_delete_comment, can_edit_comment, can_reply_to_comment
from .serializers import (
    AUDIO_CONTENT_TYPES,
    AUDIO_EXTENSIONS,
    AskSerializer,
    CommentReplySerializer,
    CourseCommentSerializer,
    RateSerializer,
    TeacherAnswerSerializer,
    VoiceQuestionCreateSerializer,
    VoiceQuestionSerializer,
    VoiceReviewSerializer,
)
from .services import (
    answers_enabled,
    transcription_enabled,
    transcription_provider,
    use_local_whisper,
)

logger = logging.getLogger(__name__)

Status = VoiceQuestion.Status
Stage = VoiceQuestion.Stage


class VoiceServiceUnavailable(APIException):
    status_code = 503
    default_code = "voice_service_unavailable"
    default_detail = "Voice questions are temporarily unavailable."


WORKER_DOWN = (
    "The background worker is unavailable. Start Redis and the Celery worker, then try again."
)


def _enqueue(task, question, stage):
    """Queue a Celery task; fail the question immediately if the broker is unreachable."""
    try:
        task.apply_async(args=[str(question.pk)], retry=False)
    except (KombuOperationalError, OSError) as error:
        logger.warning("Voice question broker unavailable: %s", error)
        question.status = Status.FAILED
        question.failed_stage = stage
        question.error_message = WORKER_DOWN
        question.save(update_fields=["status", "failed_stage", "error_message", "updated_at"])
        raise VoiceServiceUnavailable(WORKER_DOWN) from error


def _transcription_requirement():
    if use_local_whisper():
        return "the local Whisper model (pip install openai-whisper imageio-ffmpeg)"
    if transcription_provider() == "gemini":
        return "GEMINI_API_KEY"
    return "OPENAI_API_KEY"


def _require(enabled, what, variable):
    if not enabled:
        raise VoiceServiceUnavailable(
            f"{what} is not configured on the server. An administrator must set up {variable}."
        )


class VoiceQuestionViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """A student's voice questions. Everyone only ever sees their own."""

    permission_classes = [IsAuthenticated]
    serializer_class = VoiceQuestionSerializer

    def get_queryset(self):
        queryset = VoiceQuestion.objects.select_related("course").filter(student=self.request.user)
        course = self.request.query_params.get("course")
        if course:
            if not course.isdigit():
                raise serializers.ValidationError({"course": "Invalid course."})
            queryset = queryset.filter(course_id=course)
        return queryset

    def create(self, request, *args, **kwargs):
        _require(transcription_enabled(), "Speech recognition", _transcription_requirement())
        _require(answers_enabled(), "AI answers", "GEMINI_API_KEY")
        payload = VoiceQuestionCreateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data

        busy = [
            question
            for question in VoiceQuestion.objects.filter(
                student=request.user, status__in=[Status.TRANSCRIBING, Status.ANSWERING]
            )
            if expire_if_stale(question).is_busy
        ]
        if len(busy) >= settings.VOICE_QA_MAX_ACTIVE:
            raise Throttled(detail="Wait for your current question to finish.")

        audio = data["audio"]
        extension = Path(audio.name).suffix.lower().lstrip(".")
        question = VoiceQuestion(
            student=request.user,
            course=data["course"],
            audio_name=Path(audio.name).name[:255],
            audio_content_type=AUDIO_CONTENT_TYPES.get(extension, ""),
            language_hint=data["language"],
        )
        question.audio.save(audio.name, audio, save=False)
        question.save()

        from .tasks import transcribe_question_task

        _enqueue(transcribe_question_task, question, Stage.TRANSCRIPTION)
        question.refresh_from_db()  # already done when tasks run eagerly
        return Response(self.get_serializer(question).data, status=status.HTTP_202_ACCEPTED)

    def retrieve(self, request, *args, **kwargs):
        question = expire_if_stale(self.get_object())
        return Response(self.get_serializer(question).data)

    def perform_destroy(self, instance):
        if instance.is_busy:
            raise serializers.ValidationError(
                {"non_field_errors": ["Wait until this question is processed before deleting it."]}
            )
        instance.delete()

    @action(detail=True, methods=["post"])
    def ask(self, request, pk=None):
        """Send the (edited) transcription to Gemini. Also used to re-ask after an answer."""
        question = expire_if_stale(self.get_object())
        if question.is_busy:
            raise serializers.ValidationError(
                {"non_field_errors": ["This question is already being processed."]}
            )
        if not question.transcript:
            raise serializers.ValidationError(
                {"non_field_errors": ["The recording has not been transcribed yet."]}
            )
        if question.escalated_at:
            raise serializers.ValidationError(
                {"non_field_errors": ["This question was sent to your teacher and can no longer be changed."]}
            )
        _require(answers_enabled(), "AI answers", "GEMINI_API_KEY")
        payload = AskSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        question.question_text = payload.validated_data["question_text"]
        question.status = Status.ANSWERING
        question.answer = ""
        question.failed_stage = ""
        question.error_message = ""
        # A new answer gets a new rating.
        question.rating = question.rating_reason = question.rating_comment = ""
        question.rated_at = None
        question.save()

        from .tasks import answer_question_task

        _enqueue(answer_question_task, question, Stage.ANSWER)
        question.refresh_from_db()
        return Response(self.get_serializer(question).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        """Retry the step that failed (transcription or answer)."""
        question = expire_if_stale(self.get_object())
        if question.status != Status.FAILED:
            raise serializers.ValidationError({"non_field_errors": ["There is nothing to retry."]})

        from .tasks import answer_question_task, transcribe_question_task

        if question.failed_stage == Stage.ANSWER and question.question_text:
            _require(answers_enabled(), "AI answers", "GEMINI_API_KEY")
            question.status, task, stage = Status.ANSWERING, answer_question_task, Stage.ANSWER
        else:
            _require(transcription_enabled(), "Speech recognition", _transcription_requirement())
            question.status, task, stage = (
                Status.TRANSCRIBING,
                transcribe_question_task,
                Stage.TRANSCRIPTION,
            )
        question.failed_stage = ""
        question.error_message = ""
        question.save()
        _enqueue(task, question, stage)
        question.refresh_from_db()
        return Response(self.get_serializer(question).data, status=status.HTTP_202_ACCEPTED)

    def _answered_question(self):
        question = self.get_object()
        if question.status != Status.ANSWERED:
            raise serializers.ValidationError(
                {"non_field_errors": ["Wait for the AI answer first."]}
            )
        return question

    @action(detail=True, methods=["post"])
    def rate(self, request, pk=None):
        """The student says whether the AI answer helped (and why not)."""
        question = self._answered_question()
        if question.escalated_at:
            raise serializers.ValidationError(
                {"non_field_errors": ["This question was already sent to your teacher."]}
            )
        payload = RateSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        question.rating = data["rating"]
        question.rating_reason = data["reason"]
        question.rating_comment = data["comment"]
        question.rated_at = timezone.now()
        question.save(update_fields=["rating", "rating_reason", "rating_comment", "rated_at", "updated_at"])
        return Response(self.get_serializer(question).data)

    @action(detail=True, methods=["post"])
    def escalate(self, request, pk=None):
        """Send an unhelpful AI answer to the course teacher for a verified answer."""
        question = self._answered_question()
        if question.rating != VoiceQuestion.Rating.NOT_HELPFUL:
            raise serializers.ValidationError(
                {"non_field_errors": ["Tell us why the answer did not help before asking your teacher."]}
            )
        if question.escalated_at:
            raise serializers.ValidationError(
                {"non_field_errors": ["This question was already sent to your teacher."]}
            )
        question.escalated_at = timezone.now()
        question.save(update_fields=["escalated_at", "updated_at"])
        return Response(self.get_serializer(question).data)

    @action(detail=True, methods=["get"], url_path="audio", url_name="audio")
    def audio(self, request, pk=None):
        question = self.get_object()
        return build_file_response(
            request,
            question.audio,
            question.audio_name,
            as_attachment=False,
            content_type=question.audio_content_type or None,
        )


class VoiceConfigView(APIView):
    """What the browser needs to know: limits, formats and whether the AI is configured."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(
            {
                "enabled": transcription_enabled() and answers_enabled(),
                "transcription_enabled": transcription_enabled(),
                "answers_enabled": answers_enabled(),
                "max_audio_mb": settings.VOICE_QA_MAX_AUDIO_MB,
                "max_audio_bytes": settings.VOICE_QA_MAX_AUDIO_MB * 1024 * 1024,
                "max_recording_seconds": settings.VOICE_QA_MAX_RECORDING_SECONDS,
                "audio_extensions": list(AUDIO_EXTENSIONS),
                "languages": [
                    {"value": value, "label": label}
                    for value, label in VoiceQuestion.Language.choices
                ],
                "server_time": timezone.now(),
            }
        )


class VoiceReviewViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Questions students sent to their teacher after an unhelpful AI answer.

    A teacher sees those of their own courses, an admin all of them.
    ``?status=pending|answered`` and ``?course=<id>`` filter the list.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = VoiceReviewSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role not in {User.Role.TEACHER, User.Role.ADMIN}:
            raise PermissionDenied("Only teachers can review questions.")
        queryset = VoiceQuestion.objects.select_related(
            "course", "student", "teacher_answered_by"
        ).filter(escalated_at__isnull=False).order_by("-escalated_at")
        if user.role == User.Role.TEACHER:
            queryset = queryset.filter(course__owner=user)

        params = self.request.query_params
        review_status = params.get("status")
        if review_status == "pending":
            queryset = queryset.filter(teacher_answer="")
        elif review_status == "answered":
            queryset = queryset.exclude(teacher_answer="")
        elif review_status:
            raise serializers.ValidationError({"status": "Use “pending” or “answered”."})
        course = params.get("course")
        if course:
            if not course.isdigit():
                raise serializers.ValidationError({"course": "Invalid course."})
            queryset = queryset.filter(course_id=course)
        return queryset

    @action(detail=True, methods=["post"])
    def answer(self, request, pk=None):
        """Write (or rewrite) the verified answer the student will see."""
        question = self.get_object()
        payload = TeacherAnswerSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        question.teacher_answer = payload.validated_data["teacher_answer"]
        question.teacher_answered_by = request.user
        question.teacher_answered_at = timezone.now()
        question.save(
            update_fields=["teacher_answer", "teacher_answered_by", "teacher_answered_at", "updated_at"]
        )
        return Response(self.get_serializer(question).data)


class CommentCreateThrottle(UserRateThrottle):
    """Limits how fast one user can post comments (anti-spam)."""

    scope = "course_comments"
    rate = "30/hour"


class CourseCommentViewSet(viewsets.ModelViewSet):
    """Comments on a course and the teacher's replies.

    ``?course=<id>`` lists a course's comments (every signed-in user can read them).
    Without it: a student gets their own comments, a teacher the comments on their
    courses, an admin every comment. ``?unanswered=1`` keeps comments without a reply.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = CourseCommentSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_throttles(self):
        if self.action == "create":
            return [CommentCreateThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        user = self.request.user
        queryset = CourseComment.objects.select_related("author", "replied_by", "course")
        if self.action != "list":
            return queryset

        course = self.request.query_params.get("course")
        if course:
            if not course.isdigit():
                raise serializers.ValidationError({"course": "Invalid course."})
            queryset = queryset.filter(course_id=course)
        elif user.role == User.Role.TEACHER:
            queryset = queryset.filter(course__owner=user)
        elif user.role != User.Role.ADMIN:
            queryset = queryset.filter(author=user)

        if self.request.query_params.get("unanswered") in {"1", "true"}:
            queryset = queryset.filter(reply="")
        return queryset

    def perform_create(self, serializer):
        if self.request.user.role != User.Role.STUDENT:
            raise PermissionDenied("Only students can comment on a course.")
        serializer.save(author=self.request.user)

    def perform_update(self, serializer):
        if not can_edit_comment(self.request.user, serializer.instance):
            raise PermissionDenied("You can only edit your own comments.")
        serializer.save(edited_at=timezone.now())

    def perform_destroy(self, instance):
        if not can_delete_comment(self.request.user, instance):
            raise PermissionDenied("You cannot delete this comment.")
        instance.delete()

    @action(detail=True, methods=["post", "delete"])
    def reply(self, request, pk=None):
        """POST writes or replaces the reply, DELETE removes it."""
        comment = self.get_object()
        if not can_reply_to_comment(request.user, comment):
            raise PermissionDenied("Only the teacher of this course can reply.")

        if request.method == "DELETE":
            comment.reply, comment.replied_by, comment.replied_at = "", None, None
        else:
            payload = CommentReplySerializer(data=request.data)
            payload.is_valid(raise_exception=True)
            comment.reply = payload.validated_data["reply"]
            comment.replied_by = request.user
            comment.replied_at = timezone.now()
        comment.save(update_fields=["reply", "replied_by", "replied_at"])
        return Response(self.get_serializer(comment).data)
