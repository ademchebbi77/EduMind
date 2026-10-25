from datetime import timedelta
from unittest import mock

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from assessments.models import QuizAttempt
from courses.tests.utils import TemporaryMediaMixin

from .utils import create_course, create_quiz, make_user


def start_url(quiz):
    return f"/api/quizzes/{quiz.pk}/start/"


def submit_url(quiz):
    return f"/api/quizzes/{quiz.pk}/submit/"


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class AttemptTests(TemporaryMediaMixin, APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)
        self.student = make_user("student@example.com", User.Role.STUDENT)
        self.other_student = make_user("other@example.com", User.Role.STUDENT)
        self.course = create_course(self.teacher)
        self.quiz = create_quiz(
            self.course,
            passing_score=60,
            questions=[
                ("single_choice", 2, [("Paris", True), ("Lyon", False), ("Nice", False)]),
                ("multiple_choice", 3, [("2", True), ("3", True), ("4", False)]),
                ("true_false", 5, [("True", False), ("False", True)]),
            ],
        )
        self.questions = list(self.quiz.questions.prefetch_related("options"))
        self.client.force_login(self.student)

    def option(self, question_index, text):
        return next(
            o.id for o in self.questions[question_index].options.all() if o.text == text
        )

    def answer(self, question_index, *texts):
        return {
            "question": self.questions[question_index].id,
            "selected_options": [self.option(question_index, text) for text in texts],
        }

    def submit(self, answers):
        return self.client.post(submit_url(self.quiz), {"answers": answers}, format="json")

    def test_start_returns_questions_without_answers(self):
        response = self.client.post(start_url(self.quiz))

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["attempt"]["status"], "in_progress")
        self.assertEqual(len(data["quiz"]["questions"]), 3)
        self.assertNotIn("is_correct", str(data))
        self.assertNotIn("explanation", str(data))

    def test_start_resumes_running_attempt(self):
        first = self.client.post(start_url(self.quiz)).json()["attempt"]["id"]
        response = self.client.post(start_url(self.quiz))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["attempt"]["id"], first)
        self.assertEqual(QuizAttempt.objects.count(), 1)

    def test_perfect_score(self):
        self.client.post(start_url(self.quiz))

        response = self.submit(
            [self.answer(0, "Paris"), self.answer(1, "2", "3"), self.answer(2, "False")]
        )

        self.assertEqual(response.status_code, 200, response.json())
        data = response.json()
        self.assertEqual((data["score"], data["max_score"]), (10, 10))
        self.assertEqual(data["percentage"], 100.0)
        self.assertTrue(data["passed"])
        self.assertEqual(data["status"], "submitted")
        self.assertTrue(all(answer["is_correct"] for answer in data["answers"]))

    def test_partial_multiple_choice_earns_nothing(self):
        self.client.post(start_url(self.quiz))

        data = self.submit(
            [self.answer(0, "Paris"), self.answer(1, "2"), self.answer(2, "True")]
        ).json()

        self.assertEqual(data["score"], 2)
        self.assertEqual(data["percentage"], 20.0)
        self.assertFalse(data["passed"])
        self.assertEqual([a["is_correct"] for a in data["answers"]], [True, False, False])

    def test_extra_wrong_option_in_multiple_choice_is_incorrect(self):
        self.client.post(start_url(self.quiz))

        data = self.submit([self.answer(1, "2", "3", "4")]).json()

        self.assertEqual(data["score"], 0)

    def test_unanswered_questions_count_as_wrong(self):
        self.client.post(start_url(self.quiz))

        data = self.submit([self.answer(2, "False")]).json()

        self.assertEqual((data["score"], data["max_score"]), (5, 10))
        self.assertEqual(len(data["answers"]), 3)
        self.assertEqual(data["answers"][0]["selected_options"], [])

    def test_pass_threshold_is_inclusive(self):
        self.quiz.passing_score = 50
        self.quiz.save()
        self.client.post(start_url(self.quiz))

        data = self.submit([self.answer(2, "False")]).json()

        self.assertEqual(data["percentage"], 50.0)
        self.assertTrue(data["passed"])

    def test_client_cannot_submit_its_own_score(self):
        self.client.post(start_url(self.quiz))

        response = self.client.post(
            submit_url(self.quiz),
            {"answers": [], "score": 10, "passed": True, "percentage": 100},
            format="json",
        )

        self.assertEqual(response.json()["score"], 0)
        self.assertFalse(response.json()["passed"])

    def test_correction_reveals_answers_after_submission(self):
        self.client.post(start_url(self.quiz))

        data = self.submit([self.answer(0, "Lyon")]).json()

        self.assertTrue(data["answers_revealed"])
        first = data["answers"][0]
        self.assertEqual(first["explanation"], "Explanation 1")
        self.assertEqual(
            [o["text"] for o in first["options"] if o["is_correct"]], ["Paris"]
        )

    def test_correction_hidden_when_quiz_does_not_reveal(self):
        self.quiz.reveal_answers = False
        self.quiz.save()
        self.client.post(start_url(self.quiz))

        data = self.submit([self.answer(0, "Lyon")]).json()

        self.assertFalse(data["answers_revealed"])
        self.assertNotIn("is_correct", str(data["answers"][0]["options"]))
        self.assertNotIn("explanation", data["answers"][0])
        # The student still learns whether each answer was right.
        self.assertFalse(data["answers"][0]["is_correct"])

    def test_invalid_answers_are_rejected(self):
        self.client.post(start_url(self.quiz))
        other_quiz = create_quiz(self.course, title="Other")
        foreign_question = other_quiz.questions.first()
        cases = [
            [{"question": foreign_question.id, "selected_options": []}],
            [self.answer(0, "Paris"), self.answer(0, "Lyon")],
            [self.answer(0, "Paris", "Lyon")],
            [self.answer(2, "True", "False")],
            [{"question": self.questions[0].id, "selected_options": [self.option(1, "2")]}],
            [{"question": self.questions[0].id, "selected_options": [self.option(0, "Paris")] * 2}],
            [{"question": "abc", "selected_options": []}],
        ]
        for answers in cases:
            with self.subTest(answers=answers):
                self.assertEqual(self.submit(answers).status_code, 400)
        self.assertEqual(QuizAttempt.objects.get().status, "in_progress")

    def test_submit_requires_started_attempt(self):
        response = self.submit([])

        self.assertEqual(response.status_code, 400)

    def test_cannot_submit_twice(self):
        self.client.post(start_url(self.quiz))
        self.submit([self.answer(0, "Paris")])

        self.assertEqual(self.submit([self.answer(0, "Paris")]).status_code, 400)

    def test_attempt_limit(self):
        self.quiz.max_attempts = 1
        self.quiz.save()
        self.client.post(start_url(self.quiz))
        self.submit([])

        response = self.client.post(start_url(self.quiz))

        self.assertEqual(response.status_code, 400)
        self.assertIn("attempts", str(response.json()))

    def test_teachers_cannot_take_quizzes(self):
        self.client.force_login(self.teacher)

        self.assertEqual(self.client.post(start_url(self.quiz)).status_code, 403)
        self.assertEqual(self.submit([]).status_code, 403)

    def test_cannot_start_draft_quiz(self):
        self.quiz.is_published = False
        self.quiz.save()

        self.assertEqual(self.client.post(start_url(self.quiz)).status_code, 404)

    def test_timed_quiz_sets_deadline(self):
        self.quiz.duration_minutes = 10
        self.quiz.save()

        attempt = self.client.post(start_url(self.quiz)).json()["attempt"]

        self.assertIsNotNone(attempt["expires_at"])

    def test_late_submission_is_expired_with_zero(self):
        self.quiz.duration_minutes = 1
        self.quiz.save()
        self.client.post(start_url(self.quiz))
        later = timezone.now() + timedelta(minutes=5)

        with mock.patch("assessments.services.timezone.now", return_value=later):
            data = self.submit([self.answer(0, "Paris")]).json()

        self.assertEqual(data["status"], "expired")
        self.assertEqual(data["score"], 0)
        self.assertFalse(data["passed"])

    def test_submission_within_grace_period_is_graded(self):
        self.quiz.duration_minutes = 1
        self.quiz.save()
        self.client.post(start_url(self.quiz))
        slightly_late = timezone.now() + timedelta(minutes=1, seconds=10)

        with mock.patch("assessments.services.timezone.now", return_value=slightly_late):
            data = self.submit([self.answer(0, "Paris")]).json()

        self.assertEqual(data["status"], "submitted")
        self.assertEqual(data["score"], 2)

    def test_starting_after_deadline_expires_old_attempt(self):
        self.quiz.duration_minutes = 1
        self.quiz.save()
        first = self.client.post(start_url(self.quiz)).json()["attempt"]["id"]
        later = timezone.now() + timedelta(minutes=5)

        with mock.patch("assessments.services.timezone.now", return_value=later):
            second = self.client.post(start_url(self.quiz)).json()["attempt"]["id"]

        self.assertNotEqual(first, second)
        self.assertEqual(QuizAttempt.objects.get(pk=first).status, "expired")

    def test_attempt_history_and_detail_are_private(self):
        self.client.post(start_url(self.quiz))
        attempt_id = self.submit([self.answer(0, "Paris")]).json()["id"]
        detail = f"/api/quizzes/{self.quiz.pk}/attempts/{attempt_id}/"

        history = self.client.get(f"/api/quizzes/{self.quiz.pk}/attempts/").json()
        self.assertEqual(history["count"], 1)
        self.assertEqual(self.client.get(detail).status_code, 200)

        self.client.force_login(self.other_student)
        self.assertEqual(
            self.client.get(f"/api/quizzes/{self.quiz.pk}/attempts/").json()["count"], 0
        )
        self.assertEqual(self.client.get(detail).status_code, 404)

        self.client.force_login(self.teacher)
        self.assertEqual(
            self.client.get(f"/api/quizzes/{self.quiz.pk}/attempts/").json()["count"], 1
        )
        manager_view = self.client.get(detail).json()
        self.assertTrue(manager_view["answers_revealed"])

    def test_in_progress_attempt_detail_has_no_answers(self):
        attempt_id = self.client.post(start_url(self.quiz)).json()["attempt"]["id"]

        data = self.client.get(f"/api/quizzes/{self.quiz.pk}/attempts/{attempt_id}/").json()

        self.assertEqual(data["answers"], [])
        self.assertFalse(data["answers_revealed"])

    def test_list_reports_student_statistics(self):
        self.client.post(start_url(self.quiz))
        self.submit([self.answer(2, "False")])

        item = self.client.get("/api/quizzes/").json()["results"][0]

        self.assertEqual(item["my_attempt_count"], 1)
        self.assertEqual(item["my_best_percentage"], 50.0)
