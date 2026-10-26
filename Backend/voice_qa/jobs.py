"""Background work for voice questions (run by Celery, see tasks.py)."""

import logging
from datetime import timedelta
from pathlib import Path

from celery.exceptions import SoftTimeLimitExceeded
from django.conf import settings
from django.utils import timezone

from .models import VoiceQuestion
from .services import (
    ServiceError,
    answer_question,
    question_language,
    timed,
    transcribe,
    transcription_model_label,
)

logger = logging.getLogger(__name__)

Status = VoiceQuestion.Status
Stage = VoiceQuestion.Stage
HISTORY_TURNS = 3


def _save(question, **fields):
    for name, value in fields.items():
        setattr(question, name, value)
    VoiceQuestion.objects.filter(pk=question.pk).update(**fields, updated_at=timezone.now())


def _fail(question, stage, message):
    _save(question, status=Status.FAILED, failed_stage=stage, error_message=message)


def _run(question, stage, work):
    try:
        work()
    except ServiceError as error:
        _fail(question, stage, error.message)
    except SoftTimeLimitExceeded:
        _fail(question, stage, "This took too long. Try again.")
    except Exception:
        logger.exception("Voice question %s failed during %s", question.pk, stage)
        _fail(question, stage, "An unexpected error occurred. Try again.")


def run_transcription(question_id):
    question = VoiceQuestion.objects.filter(pk=question_id).first()
    if question is None or question.status != Status.TRANSCRIBING:
        return question

    def work():
        with question.audio.open("rb") as handle:
            (text, language), elapsed = timed(
                transcribe,
                handle,
                Path(question.audio.name).name,
                question.audio_content_type,
                question.language_hint,
            )
        _save(
            question,
            status=Status.TRANSCRIBED,
            transcript=text,
            question_text=text,
            detected_language=language,
            transcription_model=transcription_model_label(),
            transcription_ms=elapsed,
            failed_stage="",
            error_message="",
        )

    _run(question, Stage.TRANSCRIPTION, work)
    return question


def run_answer(question_id):
    question = (
        VoiceQuestion.objects.select_related("course", "student").filter(pk=question_id).first()
    )
    if question is None or question.status != Status.ANSWERING:
        return question

    def work():
        language = question_language(question.question_text, fallback=question.detected_language)
        # Recent answered questions on the same course give follow-ups their context.
        history = list(
            VoiceQuestion.objects.filter(
                student=question.student,
                course=question.course,
                status=Status.ANSWERED,
                created_at__lt=question.created_at,
            ).order_by("-created_at")[:HISTORY_TURNS]
        )[::-1]
        (answer, source, model), elapsed = timed(
            answer_question,
            question.question_text,
            question.course,
            question.student,
            language,
            history,
        )
        _save(
            question,
            status=Status.ANSWERED,
            answer=answer,
            answer_language=language,
            answer_model=model,
            answer_ms=elapsed,
            context_source=source,
            answered_at=timezone.now(),
            failed_stage="",
            error_message="",
        )

    _run(question, Stage.ANSWER, work)
    return question


def expire_if_stale(question):
    """Fail work that no background worker finished in a reasonable time."""
    if not question.is_busy:
        return question
    if timezone.now() - question.updated_at > timedelta(minutes=settings.VOICE_QA_STALE_MINUTES):
        stage = Stage.TRANSCRIPTION if question.status == Status.TRANSCRIBING else Stage.ANSWER
        _fail(
            question,
            stage,
            "No background worker processed this request. Check that Redis and the Celery "
            "worker are running, then retry.",
        )
    return question
