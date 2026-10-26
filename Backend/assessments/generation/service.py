"""Glue between the local generator, background jobs and the quiz API."""

import difflib
import logging
import time
from datetime import timedelta
from statistics import median

from celery.exceptions import SoftTimeLimitExceeded
from django.conf import settings
from django.utils import timezone

from ..models import QuizGenerationJob
from .extraction import ExtractionError, extract_course, extract_file
from .generator import MIN_QUESTIONS, QUESTION_TYPES, GenerationError, generate_quiz
from .text import normalize

logger = logging.getLogger(__name__)

Status = QuizGenerationJob.Status
Stage = QuizGenerationJob.Stage
STAGE_PROGRESS = {Stage.EXTRACTING: 15, Stage.ANALYSING: 45, Stage.GENERATING: 75}
ACTIVE_STATUSES = (Status.QUEUED, Status.PROCESSING)


def _update(job, **fields):
    for name, value in fields.items():
        setattr(job, name, value)
    QuizGenerationJob.objects.filter(pk=job.pk).update(**fields)


def _fail(job, message):
    _update(
        job,
        status=Status.FAILED,
        stage=Stage.FAILED,
        error_message=message,
        finished_at=timezone.now(),
    )


def _delete_source(job):
    if not job.source_file:
        return
    try:
        job.source_file.delete(save=False)
        QuizGenerationJob.objects.filter(pk=job.pk).update(source_file="")
    except Exception:
        logger.exception("Unable to delete the source document of generation job %s", job.pk)


def humanize_filename(name):
    """'Chapitre_2 - Tests.pdf' → 'Chapitre 2 Tests'."""
    stem = name.rsplit(".", 1)[0]
    return " ".join(stem.replace("_", " ").replace("-", " ").split()) or name


def document_title(job):
    """Human title for the quiz: the course title, or a cleaned-up file name."""
    if job.course_id and not job.source_file:
        return job.source_name
    return humanize_filename(job.source_name)


def is_grounded(question):
    """The correct answer comes from the source sentence and no wrong option does.

    True/false questions are grounded when "true" statements repeat the source
    and "false" statements differ from it.
    """
    source = normalize(question["source"])
    options = question["options"]
    if question["type"] == "true_false":
        statement_is_source = normalize(question["source"]).rstrip(".") in normalize(question["text"])
        answer_true = options[0]["is_correct"]
        return statement_is_source == answer_true
    correct = [option for option in options if option["is_correct"]]
    wrong = [option for option in options if not option["is_correct"]]
    return all(normalize(option["text"]) in source for option in correct) and not any(
        f" {normalize(option['text'])} " in f" {source} " for option in wrong
    )


def validate_questions(questions):
    """Keep only questions the quiz API accepts. Returns (valid, invalid_count)."""
    from ..serializers import QuestionSerializer  # avoid an import cycle

    valid = []
    for question in questions:
        payload = {key: question[key] for key in ("text", "type", "points", "explanation", "options")}
        if QuestionSerializer(data=payload).is_valid():
            valid.append(question)
    return valid, len(questions) - len(valid)


def run_job(job_id):
    """Execute a generation job. Never raises: failures are stored on the job."""
    job = QuizGenerationJob.objects.select_related("course").filter(pk=job_id).first()
    if job is None or job.status != Status.QUEUED:
        return job

    def stage(name):
        _update(job, stage=name, progress=STAGE_PROGRESS[name])

    _update(job, status=Status.PROCESSING, started_at=timezone.now())
    try:
        stage(Stage.EXTRACTING)
        started = time.perf_counter()
        if job.course_id and not job.source_file:
            text = extract_course(job.course)
        else:
            text = extract_file(job.source_file, job.source_file.name)
        extraction_ms = round((time.perf_counter() - started) * 1000, 1)

        result = generate_quiz(
            text,
            num_questions=job.num_questions,
            difficulty=job.difficulty,
            types=job.question_types or QUESTION_TYPES,
            source_name=document_title(job),
            seed=job.pk.int % (2**32),
            on_stage=stage,
        )
        data = result.as_dict()
        questions, invalid = validate_questions(data["questions"])
        if len(questions) < MIN_QUESTIONS:
            raise GenerationError(
                "Not enough distinct key ideas were found to build a quiz from this document."
            )
        grounded = sum(1 for question in questions if is_grounded(question))
        data["questions"] = questions

        stats = {
            **data.pop("stats"),
            "extraction_ms": extraction_ms,
            "requested": job.num_questions,
            "generated": len(questions),
            "invalid": invalid,
            "grounded": grounded,
        }
        _update(
            job,
            status=Status.COMPLETED,
            stage=Stage.DONE,
            progress=100,
            language=data["language"],
            engine=data["engine"],
            result=data,
            stats=stats,
            finished_at=timezone.now(),
        )
    except (ExtractionError, GenerationError) as error:
        _fail(job, str(error))
    except SoftTimeLimitExceeded:
        _fail(job, "The document took too long to process. Try a shorter document.")
    except Exception:
        logger.exception("Quiz generation job %s failed", job.pk)
        _fail(job, "An unexpected error occurred while generating the quiz.")
    finally:
        _delete_source(job)
    return job


def expire_if_stale(job):
    """Fail jobs that no worker picked up (or finished) in a reasonable time."""
    if job.status not in ACTIVE_STATUSES:
        return job
    limit = timedelta(minutes=settings.QUIZ_GENERATION_STALE_MINUTES)
    if timezone.now() - job.created_at > limit:
        _fail(
            job,
            "No background worker processed this request. "
            "Check that Redis and the Celery worker are running, then try again.",
        )
        _delete_source(job)
    return job


# --- Teacher feedback & metrics ----------------------------------------------------


def _signature(text, type_, options):
    return (
        normalize(text),
        type_,
        frozenset((normalize(option["text"]), bool(option["is_correct"])) for option in options),
    )


def record_feedback(job, quiz):
    """Compare the saved quiz with what was generated: kept, edited, removed, added."""
    generated = (job.result or {}).get("questions", [])
    saved = [
        {
            "text": question.text,
            "type": question.type,
            "options": [
                {"text": option.text, "is_correct": option.is_correct}
                for option in question.options.all()
            ],
        }
        for question in quiz.questions.prefetch_related("options")
    ]
    unmatched = list(range(len(saved)))
    kept = edited = 0
    for question in generated:
        signature = _signature(question["text"], question["type"], question["options"])
        exact = next(
            (
                index
                for index in unmatched
                if _signature(saved[index]["text"], saved[index]["type"], saved[index]["options"])
                == signature
            ),
            None,
        )
        if exact is not None:
            unmatched.remove(exact)
            kept += 1
            continue
        best, best_ratio = None, 0.0
        for index in unmatched:
            ratio = difflib.SequenceMatcher(
                None, normalize(question["text"]), normalize(saved[index]["text"])
            ).ratio()
            if ratio > best_ratio:
                best, best_ratio = index, ratio
        if best is not None and best_ratio >= 0.6:
            unmatched.remove(best)
            edited += 1

    total = len(generated)
    feedback = {
        "generated": total,
        "kept": kept,
        "edited": edited,
        "removed": total - kept - edited,
        "added": len(unmatched),
        "acceptance_rate": round((kept + edited) / total, 4) if total else None,
        "unchanged_rate": round(kept / total, 4) if total else None,
    }
    QuizGenerationJob.objects.filter(pk=job.pk).update(quiz=quiz, feedback=feedback)
    job.quiz, job.feedback = quiz, feedback
    return feedback


def _percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(fraction * (len(ordered) - 1))))
    return ordered[index]


def _rate(numerator, denominator):
    return round(numerator / denominator, 4) if denominator else None


def compute_metrics(jobs):
    """Aggregate quality and performance metrics over generation jobs."""
    jobs = list(jobs)
    completed = [job for job in jobs if job.status == Status.COMPLETED]
    failed = [job for job in jobs if job.status == Status.FAILED]
    processing = [job.processing_ms for job in completed if job.processing_ms is not None]
    queue = [job.queue_ms for job in completed if job.queue_ms is not None]

    requested = sum(job.stats.get("requested", 0) for job in completed)
    generated = sum(job.stats.get("generated", 0) for job in completed)
    invalid = sum(job.stats.get("invalid", 0) for job in completed)
    grounded = sum(job.stats.get("grounded", 0) for job in completed)

    reviewed = [job for job in completed if job.feedback]
    reviewed_total = sum(job.feedback["generated"] for job in reviewed)
    kept = sum(job.feedback["kept"] for job in reviewed)
    edited = sum(job.feedback["edited"] for job in reviewed)

    def count_by(attribute):
        counts = {}
        for job in completed:
            key = getattr(job, attribute) or "unknown"
            counts[key] = counts.get(key, 0) + 1
        return counts

    return {
        "jobs": len(jobs),
        "completed": len(completed),
        "failed": len(failed),
        "success_rate": _rate(len(completed), len(completed) + len(failed)),
        "processing_ms": {
            "median": median(processing) if processing else None,
            "p95": _percentile(processing, 0.95),
            "max": max(processing) if processing else None,
        },
        "queue_ms": {
            "median": median(queue) if queue else None,
            "p95": _percentile(queue, 0.95),
        },
        "questions": {
            "requested": requested,
            "generated": generated,
            "fill_rate": _rate(generated, requested),
            "valid_rate": _rate(generated, generated + invalid),
            "grounded_rate": _rate(grounded, generated),
        },
        "teacher_review": {
            "quizzes": len(reviewed),
            "questions": reviewed_total,
            "acceptance_rate": _rate(kept + edited, reviewed_total),
            "unchanged_rate": _rate(kept, reviewed_total),
            "edited_rate": _rate(edited, reviewed_total),
        },
        "engines": count_by("engine"),
        "languages": count_by("language"),
    }
