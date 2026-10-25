from datetime import timedelta
from decimal import Decimal

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from assessments.models import ExerciseSubmission, QuizAttempt
from assessments.tests.utils import create_exercise, create_quiz
from courses.tests.utils import TemporaryMediaMixin, create_course

from ..risk import compute_risk_profiles


def make_user(email, role):
    return User.objects.create_user(
        email=email,
        password="StrongPass123!",
        first_name=email.split("@")[0].title(),
        last_name="Test",
        role=role,
    )


def make_attempt(quiz, student, percentage, *, days_ago=1, passed=None):
    if passed is None:
        passed = percentage >= 60
    attempt = QuizAttempt.objects.create(
        quiz=quiz,
        student=student,
        status=QuizAttempt.Status.SUBMITTED,
        score=round(percentage / 10),
        max_score=10,
        percentage=Decimal(str(percentage)),
        passed=passed,
        submitted_at=timezone.now() - timedelta(days=days_ago),
    )
    QuizAttempt.objects.filter(pk=attempt.pk).update(
        started_at=timezone.now() - timedelta(days=days_ago, minutes=10)
    )
    return attempt


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class RiskScoringTests(TemporaryMediaMixin, APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)
        self.course = create_course(self.teacher, title="Python")
        self.quiz = create_quiz(self.course, title="Quiz Python", passing_score=60,
                                questions=[
                                    ("single_choice", 1, [("A", True), ("B", False)]),
                                    ("single_choice", 1, [("A", True), ("B", False)]),
                                ])
        self.exercise = create_exercise(
            self.course,
            title="Exercice en retard",
            due_at=timezone.now() - timedelta(days=5),
        )

    def test_low_results_and_overdue_work_raise_the_score(self):
        struggling = make_user("struggling@example.com", User.Role.STUDENT)
        strong = make_user("strong@example.com", User.Role.STUDENT)
        make_attempt(self.quiz, struggling, 30, days_ago=2)
        make_attempt(self.quiz, struggling, 35, days_ago=4)
        make_attempt(self.quiz, strong, 92, days_ago=1)
        make_attempt(self.quiz, strong, 88, days_ago=3)
        ExerciseSubmission.objects.create(
            exercise=self.exercise,
            student=strong,
            content="Réponse.",
        )

        profiles = {p.student.email: p for p in compute_risk_profiles([struggling, strong])}

        self.assertGreater(profiles[struggling.email].score, profiles[strong.email].score)
        self.assertGreaterEqual(profiles[struggling.email].score, 30)
        self.assertIn(profiles[struggling.email].level, {"medium", "high"})
        self.assertEqual(profiles[strong.email].level, "low")
        self.assertTrue(
            any("faible" in reason for reason in profiles[struggling.email].reasons)
        )

    def test_overdue_exercises_are_counted_per_student(self):
        student = make_user("student@example.com", User.Role.STUDENT)

        profile = compute_risk_profiles([student])[0]

        self.assertEqual(profile.overdue_exercises, 1)
        self.assertTrue(any("retard" in reason for reason in profile.reasons))

    def test_students_are_sorted_by_score(self):
        struggling = make_user("struggling@example.com", User.Role.STUDENT)
        strong = make_user("strong@example.com", User.Role.STUDENT)
        make_attempt(self.quiz, struggling, 20, days_ago=35)
        make_attempt(self.quiz, strong, 95, days_ago=1)

        profiles = compute_risk_profiles([strong, struggling])

        self.assertEqual(profiles[0].student, struggling)


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class RiskApiTests(TemporaryMediaMixin, APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)
        self.admin = make_user("admin@example.com", User.Role.ADMIN)
        self.course = create_course(self.teacher, title="Python")
        self.quiz = create_quiz(self.course, title="Quiz Python")
        self.visible = make_user("visible@example.com", User.Role.STUDENT)
        self.hidden = make_user("hidden@example.com", User.Role.STUDENT)
        make_attempt(self.quiz, self.visible, 40, days_ago=3)

    def test_admin_sees_every_student(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/auth/at-risk/")

        self.assertEqual(response.status_code, 200)
        emails = {item["email"] for item in response.json()["results"]}
        self.assertEqual(emails, {self.visible.email, self.hidden.email})

    def test_teacher_only_sees_students_in_their_scope(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.get("/api/auth/at-risk/")

        self.assertEqual(response.status_code, 200)
        emails = {item["email"] for item in response.json()["results"]}
        self.assertEqual(emails, {self.visible.email})

    def test_level_filter_and_summary(self):
        self.client.force_authenticate(self.admin)
        data = self.client.get("/api/auth/at-risk/").json()

        self.assertIn("summary", data)
        response = self.client.get("/api/auth/at-risk/", {"level": "high"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            all(item["level"] == "high" for item in response.json()["results"])
        )

    def test_invalid_level_is_rejected(self):
        self.client.force_authenticate(self.admin)

        self.assertEqual(
            self.client.get("/api/auth/at-risk/", {"level": "urgent"}).status_code, 400
        )

    def test_students_are_forbidden(self):
        self.client.force_authenticate(self.visible)

        self.assertEqual(self.client.get("/api/auth/at-risk/").status_code, 403)
