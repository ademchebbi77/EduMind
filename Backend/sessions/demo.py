"""Historique de sessions et activité de démonstration.

Ces données rendent visibles les trois analyses locales : prévision de
remplissage, meilleurs créneaux et étudiants à risque. Les dates sont relatives
au jour d'exécution et la commande est idempotente.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal

from django.utils import timezone

from accounts.models import User
from announcements.demo import _seed_students
from assessments.models import Exercise, ExerciseSubmission, Quiz, QuizAttempt
from courses.models import Course

from .models import LiveSession, SessionEnrollment

# weekday : 0 = lundi ; weeks_ago : ancienneté de la session passée.
DEMO_PAST_SESSIONS = (
    {
        "title": "Atelier Python — boucles et fonctions (démo)",
        "session_type": LiveSession.SessionType.TRAINING,
        "course": "Python pour l'intelligence artificielle",
        "weekday": 1,
        "hour": 18,
        "weeks_ago": 2,
        "confirmed": 8,
    },
    {
        "title": "Python avancé — décorateurs (démo)",
        "session_type": LiveSession.SessionType.TRAINING,
        "course": "Python pour l'intelligence artificielle",
        "weekday": 1,
        "hour": 18,
        "weeks_ago": 6,
        "confirmed": 7,
    },
    {
        "title": "Atelier Python — pratique guidée (démo)",
        "session_type": LiveSession.SessionType.TRAINING,
        "course": "Python pour l'intelligence artificielle",
        "weekday": 1,
        "hour": 18,
        "weeks_ago": 10,
        "confirmed": 6,
    },
    {
        "title": "Python — séance de rattrapage (démo)",
        "session_type": LiveSession.SessionType.TRAINING,
        "course": "Python pour l'intelligence artificielle",
        "weekday": 1,
        "hour": 18,
        "weeks_ago": 14,
        "confirmed": 5,
    },
    {
        "title": "Introduction au machine learning — session live (démo)",
        "session_type": LiveSession.SessionType.COURSE,
        "course": "Introduction à l'apprentissage automatique",
        "weekday": 2,
        "hour": 14,
        "weeks_ago": 3,
        "confirmed": 5,
    },
    {
        "title": "Machine learning — évaluation formative (démo)",
        "session_type": LiveSession.SessionType.COURSE,
        "course": "Introduction à l'apprentissage automatique",
        "weekday": 2,
        "hour": 14,
        "weeks_ago": 7,
        "confirmed": 6,
    },
    {
        "title": "Deep Learning — première séance (démo)",
        "session_type": LiveSession.SessionType.TRAINING,
        "course": "Les réseaux de neurones expliqués",
        "weekday": 3,
        "hour": 18,
        "weeks_ago": 4,
        "confirmed": 4,
    },
    {
        "title": "Deep Learning — suite (démo)",
        "session_type": LiveSession.SessionType.TRAINING,
        "course": "Les réseaux de neurones expliqués",
        "weekday": 3,
        "hour": 18,
        "weeks_ago": 8,
        "confirmed": 3,
    },
    {
        "title": "Certification SQL — révision (démo)",
        "session_type": LiveSession.SessionType.TRAINING,
        "course": "",
        "weekday": 5,
        "hour": 10,
        "weeks_ago": 5,
        "confirmed": 2,
    },
    {
        "title": "Questions / réponses Python (démo)",
        "session_type": LiveSession.SessionType.COURSE,
        "course": "Python pour l'intelligence artificielle",
        "weekday": 0,
        "hour": 12,
        "weeks_ago": 2,
        "confirmed": 1,
    },
)

# Sessions à venir pour visualiser la prévision de remplissage.
DEMO_UPCOMING_SESSIONS = (
    {
        "title": "Atelier Python — projets guidés (démo)",
        "session_type": LiveSession.SessionType.TRAINING,
        "course": "Python pour l'intelligence artificielle",
        "weekday": 1,
        "hour": 18,
        "confirmed": 4,
        "pending": 1,
        "enrolled_indexes": (0, 1, 2, 3, 4),
    },
    {
        "title": "Machine learning — session de révision (démo)",
        "session_type": LiveSession.SessionType.COURSE,
        "course": "Introduction à l'apprentissage automatique",
        "weekday": 2,
        "hour": 14,
        "confirmed": 2,
        "pending": 0,
        "enrolled_indexes": (2, 3),
    },
    {
        "title": "Deep Learning — atelier pratique (démo)",
        "session_type": LiveSession.SessionType.TRAINING,
        "course": "Les réseaux de neurones expliqués",
        "weekday": 3,
        "hour": 18,
        "confirmed": 1,
        "pending": 0,
        "enrolled_indexes": (5,),
    },
)

# (moyenne de quiz en %, jours depuis la dernière tentative)
DEMO_QUIZ_HISTORY = (
    (35, 2),
    (48, 20),
    (72, 40),
    (88, 60),
    (55, 5),
    (62, 35),
    (40, 50),
    (95, 1),
)


def _past_datetime(weekday, hour, weeks_ago, now):
    local_now = timezone.localtime(now)
    days_back = (local_now.weekday() - weekday) % 7
    day = local_now.date() - timedelta(days=days_back, weeks=weeks_ago)
    return timezone.make_aware(datetime.combine(day, time(hour, 0)))


def _next_datetime(weekday, hour, now):
    local_now = timezone.localtime(now)
    days_ahead = (weekday - local_now.weekday()) % 7
    day = local_now.date() + timedelta(days=days_ahead)
    candidate = timezone.make_aware(datetime.combine(day, time(hour, 0)))
    if candidate <= local_now:
        candidate += timedelta(days=7)
    return candidate


def _seed_past_sessions(teacher, courses, students, now):
    created_count = 0
    enrollment_count = 0

    for spec in DEMO_PAST_SESSIONS:
        starts_at = _past_datetime(spec["weekday"], spec["hour"], spec["weeks_ago"], now)
        session, created = LiveSession.objects.update_or_create(
            title=spec["title"],
            defaults={
                "description": "Session de démonstration utilisée pour l'historique.",
                "session_type": spec["session_type"],
                "status": LiveSession.Status.ENDED,
                "starts_at": starts_at,
                "ends_at": starts_at + timedelta(hours=2),
                "course": courses.get(spec["course"]),
                "created_by": teacher,
            },
        )
        if spec["session_type"] == LiveSession.SessionType.TRAINING:
            session.assigned_teachers.set([teacher])
        if created:
            created_count += 1

        created_at = starts_at - timedelta(days=10)
        LiveSession.objects.filter(pk=session.pk).update(created_at=created_at)

        for student in students[: spec["confirmed"]]:
            enrollment, _ = SessionEnrollment.objects.update_or_create(
                session=session,
                student=student,
                defaults={"status": SessionEnrollment.EnrollmentStatus.CONFIRMED},
            )
            SessionEnrollment.objects.filter(pk=enrollment.pk).update(
                created_at=starts_at - timedelta(days=5)
            )
            enrollment_count += 1

    return created_count, enrollment_count


def _seed_upcoming_sessions(teacher, courses, students, now):
    created_count = 0
    enrollment_count = 0

    for spec in DEMO_UPCOMING_SESSIONS:
        starts_at = _next_datetime(spec["weekday"], spec["hour"], now)
        session, created = LiveSession.objects.update_or_create(
            title=spec["title"],
            defaults={
                "description": "Session de démonstration utilisée pour la prévision.",
                "session_type": spec["session_type"],
                "status": LiveSession.Status.SCHEDULED,
                "starts_at": starts_at,
                "ends_at": starts_at + timedelta(hours=2),
                "course": courses.get(spec["course"]),
                "created_by": teacher,
            },
        )
        if spec["session_type"] == LiveSession.SessionType.TRAINING:
            session.assigned_teachers.set([teacher])
        if created:
            created_count += 1

        LiveSession.objects.filter(pk=session.pk).update(
            created_at=now - timedelta(days=12)
        )

        for position, index in enumerate(spec["enrolled_indexes"]):
            status = (
                SessionEnrollment.EnrollmentStatus.CONFIRMED
                if position < spec["confirmed"]
                else SessionEnrollment.EnrollmentStatus.PENDING
            )
            enrollment, _ = SessionEnrollment.objects.update_or_create(
                session=session,
                student=students[index],
                defaults={"status": status},
            )
            SessionEnrollment.objects.filter(pk=enrollment.pk).update(
                created_at=now - timedelta(days=2)
            )
            enrollment_count += 1

    return created_count, enrollment_count


def _seed_quiz_attempts(students, now):
    quizzes = list(Quiz.objects.filter(is_published=True).order_by("id")[:2])
    if not quizzes:
        return 0

    created_count = 0
    for student, (percentage, days_ago) in zip(students, DEMO_QUIZ_HISTORY):
        for quiz in quizzes:
            exists = QuizAttempt.objects.filter(
                quiz=quiz,
                student=student,
                status=QuizAttempt.Status.SUBMITTED,
            ).exists()
            if exists:
                continue
            attempt = QuizAttempt.objects.create(
                quiz=quiz,
                student=student,
                status=QuizAttempt.Status.SUBMITTED,
                score=round(percentage / 10),
                max_score=10,
                percentage=Decimal(str(percentage)),
                passed=percentage >= 60,
                submitted_at=now - timedelta(days=days_ago),
            )
            QuizAttempt.objects.filter(pk=attempt.pk).update(
                started_at=now - timedelta(days=days_ago, minutes=15)
            )
            created_count += 1
    return created_count


def _seed_overdue_exercise(students, now):
    course = Course.objects.filter(
        title="Python pour l'intelligence artificielle"
    ).first()
    if course is None:
        return 0, 0

    exercise, _ = Exercise.objects.update_or_create(
        course=course,
        title="Analyse de données — exercice noté (démo)",
        defaults={
            "description": "Exercice de démonstration avec une échéance dépassée.",
            "instructions": "Décrivez votre démarche d'analyse en quelques lignes.",
            "difficulty": "beginner",
            "points": 20,
            "due_at": now - timedelta(days=7),
            "is_published": True,
        },
    )

    submission_count = 0
    for student in students[:4]:
        ExerciseSubmission.objects.update_or_create(
            exercise=exercise,
            student=student,
            defaults={
                "content": "Réponse de démonstration.",
                "score": 15,
                "feedback": "Travail correct.",
                "graded_by": course.owner,
                "graded_at": now - timedelta(days=3),
            },
        )
        submission_count += 1
    return 1, submission_count


def seed_session_history(*, now=None):
    """Crée l'historique et l'activité de démonstration ; retourne les compteurs."""
    now = now or timezone.now()
    teacher = User.objects.filter(
        email="teacher@edumind.local", role=User.Role.TEACHER
    ).first()
    if teacher is None:
        raise RuntimeError(
            "Aucun enseignant trouvé : lancez d'abord `python manage.py seed_demo`."
        )

    students = _seed_students()
    courses = {course.title: course for course in Course.objects.all()}

    past_created, past_enrollments = _seed_past_sessions(
        teacher, courses, students, now
    )
    upcoming_created, upcoming_enrollments = _seed_upcoming_sessions(
        teacher, courses, students, now
    )
    quiz_attempts = _seed_quiz_attempts(students, now)
    exercises, submissions = _seed_overdue_exercise(students, now)

    return {
        "sessions_created": past_created + upcoming_created,
        "sessions_total": len(DEMO_PAST_SESSIONS) + len(DEMO_UPCOMING_SESSIONS),
        "enrollments": past_enrollments + upcoming_enrollments,
        "quiz_attempts": quiz_attempts,
        "exercises": exercises,
        "submissions": submissions,
    }
