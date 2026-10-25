from accounts.models import User
from assessments.models import AnswerOption, Exercise, Question, Quiz
from courses.tests.utils import create_course

PASSWORD = "StrongPass123!"


def make_user(email, role, **extra):
    return User.objects.create_user(
        email=email,
        password=PASSWORD,
        first_name=extra.pop("first_name", email.split("@")[0].title()),
        last_name=extra.pop("last_name", "Test"),
        role=role,
        **extra,
    )


def question_payload(text="2 + 2 = ?", type="single_choice", points=1, options=None, **extra):
    if options is None:
        options = [
            {"text": "3", "is_correct": False},
            {"text": "4", "is_correct": True},
        ]
    return {"text": text, "type": type, "points": points, "options": options, **extra}


def quiz_payload(course, **overrides):
    payload = {
        "course": course.pk,
        "title": "Arithmetic basics",
        "description": "Warm-up quiz",
        "difficulty": "beginner",
        "duration_minutes": None,
        "passing_score": 50,
        "max_attempts": None,
        "reveal_answers": True,
        "is_published": True,
        "questions": [question_payload()],
    }
    payload.update(overrides)
    return payload


def create_quiz(course, questions=None, **fields):
    """Create a quiz directly; ``questions`` is a list of (type, points, [(text, correct)])."""
    fields.setdefault("title", "Quiz")
    fields.setdefault("is_published", True)
    quiz = Quiz.objects.create(course=course, **fields)
    if questions is None:
        questions = [("single_choice", 1, [("A", True), ("B", False)])]
    for position, (question_type, points, options) in enumerate(questions):
        question = Question.objects.create(
            quiz=quiz,
            text=f"Question {position + 1}",
            type=question_type,
            points=points,
            explanation=f"Explanation {position + 1}",
            position=position,
        )
        for option_position, (text, correct) in enumerate(options):
            AnswerOption.objects.create(
                question=question,
                text=text,
                is_correct=correct,
                position=option_position,
            )
    return quiz


def create_exercise(course, **fields):
    fields.setdefault("title", "Exercise")
    fields.setdefault("instructions", "Explain gradient descent.")
    fields.setdefault("points", 20)
    fields.setdefault("is_published", True)
    return Exercise.objects.create(course=course, **fields)


__all__ = [
    "PASSWORD",
    "create_course",
    "create_exercise",
    "create_quiz",
    "make_user",
    "question_payload",
    "quiz_payload",
]
