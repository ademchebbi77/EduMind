import logging
from pathlib import Path

from django.conf import settings
from django.utils import timezone
from kombu.exceptions import OperationalError as KombuOperationalError
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, Throttled
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from courses.file_serving import build_file_response

from .jobs import expire_if_stale
from .models import VoiceQuestion
from .serializers import (
    AUDIO_CONTENT_TYPES,
    AUDIO_EXTENSIONS,
    AskSerializer,
    VoiceQuestionCreateSerializer,
    VoiceQuestionSerializer,
)
from .services import answers_enabled, transcription_enabled, use_local_whisper

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
        _require(answers_enabled(), "AI answers", "GEMINI_API_KEY")
        payload = AskSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        question.question_text = payload.validated_data["question_text"]
        question.status = Status.ANSWERING
        question.answer = ""
        question.failed_stage = ""
        question.error_message = ""
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
