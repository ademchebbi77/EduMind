"""Live quiz game (Kahoot-style), kept deliberately simple.

How it works:
1. A teacher creates a game from one of their quizzes and gets a 6-digit PIN.
2. Students join with the PIN.
3. The teacher presses "next" to move the game forward:
       lobby -> question 1 -> results -> question 2 -> results -> ... -> finished
4. Every screen asks GET /api/live-games/<id>/ once per second and displays the state.

The server decides everything: the countdown, whether an answer is correct and how
many points it earns. Correct answers are only sent once the question is over.
"""

import random

from django.db import IntegrityError, transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from accounts.models import User

from .models import LiveAnswer, LiveGame, LivePlayer, Quiz
from .permissions import can_manage_course

SECONDS = LiveGame.SECONDS_PER_QUESTION


# --- Small helpers -------------------------------------------------------------------


def display_name(user):
    return user.first_name or user.email.split("@")[0]


def questions_of(game):
    return list(game.quiz.questions.prefetch_related("options"))


def current_question(game):
    questions = questions_of(game)
    if 0 <= game.question_index < len(questions):
        return questions[game.question_index]
    return None


def seconds_left(game):
    if game.status != LiveGame.Status.QUESTION or game.question_started_at is None:
        return 0
    elapsed = (timezone.now() - game.question_started_at).total_seconds()
    return max(0, round(SECONDS - elapsed))


def points_for(is_correct, elapsed_seconds):
    """Correct answer: 500 points + up to 500 for speed. Wrong answer: 0."""
    if not is_correct:
        return 0
    speed = max(0.0, 1 - elapsed_seconds / SECONDS)
    return 500 + round(500 * speed)


def new_pin():
    """A 6-digit PIN not used by another unfinished game."""
    while True:
        pin = f"{random.randint(0, 999999):06d}"
        if not LiveGame.objects.filter(pin=pin).exclude(status=LiveGame.Status.FINISHED).exists():
            return pin


# --- What each screen receives ---------------------------------------------------------


def game_state(game, user):
    is_host = game.host_id == user.id
    player = None if is_host else game.players.filter(student=user).first()
    question = current_question(game)

    state = {
        "id": game.id,
        "pin": game.pin,
        "quiz_title": game.quiz.title,
        "status": game.status,
        "is_host": is_host,
        "question_number": game.question_index + 1,
        "question_count": game.quiz.questions.count(),
        "seconds_left": seconds_left(game),
        "players": [display_name(p.student) for p in game.players.select_related("student")],
    }

    if question and game.status in (LiveGame.Status.QUESTION, LiveGame.Status.RESULTS):
        options = list(question.options.all())
        state["question"] = {
            "text": question.text,
            "type": question.type,
            # No "is_correct" here: students must not see the answer while playing.
            "options": [{"id": option.id, "text": option.text} for option in options],
        }
        answers = LiveAnswer.objects.filter(player__game=game, question=question)
        state["answers_count"] = answers.count()

        if game.status == LiveGame.Status.RESULTS:
            state["correct_options"] = [option.id for option in options if option.is_correct]
            counts = {option.id: 0 for option in options}
            for answer in answers:
                for option_id in answer.selected_options:
                    if option_id in counts:
                        counts[option_id] += 1
            state["answer_counts"] = counts

    if game.status in (LiveGame.Status.RESULTS, LiveGame.Status.FINISHED):
        state["leaderboard"] = [
            {"name": display_name(p.student), "score": p.score}
            for p in game.players.select_related("student").order_by("-score", "joined_at")[:10]
        ]

    if player:
        my_answer = (
            LiveAnswer.objects.filter(player=player, question=question).first() if question else None
        )
        better_players = game.players.filter(score__gt=player.score).count()
        state["me"] = {
            "name": display_name(user),
            "score": player.score,
            "rank": better_players + 1,
            "answered": my_answer is not None,
            # Only revealed with the results, like the correct answer.
            "last_correct": my_answer.is_correct if my_answer and game.status != LiveGame.Status.QUESTION else None,
            "last_points": my_answer.points if my_answer and game.status != LiveGame.Status.QUESTION else None,
        }
    return state


def get_game_for(user, game_id):
    """The game, if this user is its host or one of its players (404 otherwise)."""
    game = get_object_or_404(LiveGame.objects.select_related("quiz"), pk=game_id)
    if game.host_id != user.id and not game.players.filter(student=user).exists():
        raise NotFound()  # same answer as a game that does not exist
    return game


# --- Endpoints -------------------------------------------------------------------------


@api_view(["POST"])
def create_game(request):
    """Teacher: start a live game from one of their quizzes."""
    quiz = get_object_or_404(Quiz.objects.select_related("course"), pk=request.data.get("quiz"))
    if not can_manage_course(request.user, quiz.course):
        raise PermissionDenied()
    if not quiz.questions.exists():
        raise ValidationError({"quiz": ["This quiz has no questions."]})
    game = LiveGame.objects.create(quiz=quiz, host=request.user, pin=new_pin())
    return Response(game_state(game, request.user), status=status.HTTP_201_CREATED)


@api_view(["POST"])
def join_game(request):
    """Student: join an unfinished game with its PIN."""
    if request.user.role != User.Role.STUDENT:
        raise PermissionDenied("Only students can join a live game.")
    pin = str(request.data.get("pin", "")).strip()
    game = (
        LiveGame.objects.filter(pin=pin).exclude(status=LiveGame.Status.FINISHED).order_by("-created_at").first()
    )
    if game is None:
        raise ValidationError({"pin": ["No game is running with this PIN."]})
    LivePlayer.objects.get_or_create(game=game, student=request.user)
    return Response(game_state(game, request.user))


@api_view(["GET"])
def game_detail(request, game_id):
    """Everyone in the game: the current state (called every second)."""
    game = get_game_for(request.user, game_id)
    return Response(game_state(game, request.user))


@api_view(["POST"])
def next_step(request, game_id):
    """Teacher: move the game forward one step."""
    with transaction.atomic():
        game = get_object_or_404(LiveGame.objects.select_for_update(), pk=game_id)
        if game.host_id != request.user.id:
            raise PermissionDenied()

        last_index = game.quiz.questions.count() - 1
        if game.status == LiveGame.Status.QUESTION:
            game.status = LiveGame.Status.RESULTS  # stop answers, show the correction
        elif game.status == LiveGame.Status.FINISHED:
            raise ValidationError({"status": ["The game is already finished."]})
        elif game.question_index >= last_index:
            game.status = LiveGame.Status.FINISHED  # results of the last question -> podium
        else:
            game.question_index += 1  # lobby or results -> next question
            game.status = LiveGame.Status.QUESTION
            game.question_started_at = timezone.now()
        game.save()
    return Response(game_state(game, request.user))


@api_view(["POST"])
def answer(request, game_id):
    """Student: answer the current question (once, before the time runs out)."""
    game = get_game_for(request.user, game_id)
    player = game.players.filter(student=request.user).first()
    question = current_question(game)
    if player is None or question is None or game.status != LiveGame.Status.QUESTION:
        raise ValidationError({"non_field_errors": ["There is no question to answer right now."]})

    elapsed = (timezone.now() - game.question_started_at).total_seconds()
    if elapsed > SECONDS + 1:  # 1 second of tolerance for the network
        raise ValidationError({"non_field_errors": ["Time is up for this question."]})

    selected = request.data.get("selected_options")
    option_ids = {option.id for option in question.options.all()}
    if not isinstance(selected, list) or not selected or not set(selected) <= option_ids:
        raise ValidationError({"selected_options": ["Choose one of the answers."]})
    if question.type != "multiple_choice" and len(selected) != 1:
        raise ValidationError({"selected_options": ["Choose only one answer."]})

    correct_ids = {option.id for option in question.options.all() if option.is_correct}
    is_correct = set(selected) == correct_ids
    points = points_for(is_correct, elapsed)
    try:
        with transaction.atomic():
            LiveAnswer.objects.create(
                player=player, question=question, selected_options=sorted(set(selected)),
                is_correct=is_correct, points=points,
            )
            LivePlayer.objects.filter(pk=player.pk).update(score=F("score") + points)
    except IntegrityError:
        raise ValidationError({"non_field_errors": ["You already answered this question."]})
    return Response(game_state(game, request.user))
