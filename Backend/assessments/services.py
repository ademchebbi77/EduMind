"""Quiz attempt lifecycle and automatic grading.

Every score and correctness value is computed here, on the server, from the
answer options stored in the database. Clients only send the ids of the
options they selected.
"""

from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .models import AttemptAnswer, Question, Quiz, QuizAttempt

# Network latency and the final auto-submit should not make a student lose an
# attempt, so a short grace period is accepted after the deadline.
SUBMISSION_GRACE = timedelta(seconds=30)

SINGLE_ANSWER_TYPES = {Question.Type.SINGLE_CHOICE, Question.Type.TRUE_FALSE}


def _is_past_deadline(attempt, now):
    return attempt.expires_at is not None and now > attempt.expires_at + SUBMISSION_GRACE


def _percentage(score, max_score):
    if max_score <= 0:
        return Decimal("0.00")
    value = Decimal(score) * Decimal(100) / Decimal(max_score)
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _finalize(attempt, quiz, questions, selections, status, now):
    """Grade ``selections`` ({question_id: set(option_ids)}) and close the attempt."""
    score = 0
    max_score = 0
    attempt.answers.all().delete()

    for question in questions:
        max_score += question.points
        selected = selections.get(question.id, set())
        correct = {option.id for option in question.options.all() if option.is_correct}
        is_correct = bool(correct) and selected == correct
        points = question.points if is_correct else 0
        score += points

        answer = AttemptAnswer.objects.create(
            attempt=attempt,
            question=question,
            is_correct=is_correct,
            points_awarded=points,
        )
        if selected:
            answer.selected_options.set(selected)

    attempt.status = status
    attempt.score = score
    attempt.max_score = max_score
    attempt.percentage = _percentage(score, max_score)
    attempt.passed = (
        status == QuizAttempt.Status.SUBMITTED
        and attempt.percentage >= quiz.passing_score
    )
    attempt.submitted_at = now
    attempt.save()
    return attempt


def _quiz_questions(quiz):
    return list(quiz.questions.prefetch_related("options").all())


def expire_attempt(attempt, now=None):
    """Close an attempt whose deadline passed; answers sent too late are ignored."""
    now = now or timezone.now()
    quiz = attempt.quiz
    return _finalize(
        attempt, quiz, _quiz_questions(quiz), {}, QuizAttempt.Status.EXPIRED, now
    )


def attempts_used(quiz, student):
    return QuizAttempt.objects.filter(quiz=quiz, student=student).count()


@transaction.atomic
def start_attempt(quiz: Quiz, student):
    """Return ``(attempt, created)``; an attempt still running is resumed."""
    now = timezone.now()
    # Lock the student's attempts on this quiz so two parallel "start" calls
    # cannot both create an attempt and bypass the limit.
    running = list(
        QuizAttempt.objects.select_for_update()
        .filter(quiz=quiz, student=student, status=QuizAttempt.Status.IN_PROGRESS)
        .select_related("quiz")
    )
    for attempt in running:
        if _is_past_deadline(attempt, now):
            expire_attempt(attempt, now)
        else:
            return attempt, False

    if not quiz.questions.exists():
        raise serializers.ValidationError(
            {"non_field_errors": ["This quiz has no questions yet."]}
        )

    if quiz.max_attempts is not None and attempts_used(quiz, student) >= quiz.max_attempts:
        raise serializers.ValidationError(
            {"non_field_errors": ["You have used all the attempts allowed for this quiz."]}
        )

    attempt = QuizAttempt.objects.create(quiz=quiz, student=student)
    expires_at = attempt.compute_expiry(attempt.started_at)
    if expires_at is not None:
        attempt.expires_at = expires_at
        attempt.save(update_fields=["expires_at"])
    return attempt, True


def _validate_selections(questions, answers):
    by_id = {question.id: question for question in questions}
    selections = {}
    errors = []

    for index, answer in enumerate(answers):
        question_id = answer["question"]
        question = by_id.get(question_id)
        if question is None:
            errors.append(f"Answer {index + 1}: this question does not belong to the quiz.")
            continue
        if question_id in selections:
            errors.append(f"Answer {index + 1}: the question was answered more than once.")
            continue

        option_ids = answer.get("selected_options") or []
        selected = set(option_ids)
        if len(selected) != len(option_ids):
            errors.append(f"Answer {index + 1}: an option was selected more than once.")
            continue
        valid_ids = {option.id for option in question.options.all()}
        if not selected <= valid_ids:
            errors.append(f"Answer {index + 1}: an option does not belong to the question.")
            continue
        if question.type in SINGLE_ANSWER_TYPES and len(selected) > 1:
            errors.append(f"Answer {index + 1}: this question accepts a single answer.")
            continue
        selections[question_id] = selected

    if errors:
        raise serializers.ValidationError({"answers": errors})
    return selections


@transaction.atomic
def submit_attempt(quiz: Quiz, student, answers):
    now = timezone.now()
    attempt = (
        QuizAttempt.objects.select_for_update()
        .filter(quiz=quiz, student=student, status=QuizAttempt.Status.IN_PROGRESS)
        .select_related("quiz")
        .first()
    )
    if attempt is None:
        raise serializers.ValidationError(
            {"non_field_errors": ["Start the quiz before submitting answers."]}
        )

    if _is_past_deadline(attempt, now):
        return expire_attempt(attempt, now)

    questions = _quiz_questions(quiz)
    selections = _validate_selections(questions, answers)
    return _finalize(attempt, quiz, questions, selections, QuizAttempt.Status.SUBMITTED, now)
