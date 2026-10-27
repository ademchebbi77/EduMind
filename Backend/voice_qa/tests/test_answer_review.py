from unittest import mock

from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from courses.models import Course
from voice_qa.models import VoiceQuestion

URL = "/api/voice-questions/"
REVIEWS = "/api/voice-questions/reviews/"


class AnswerReviewTests(APITestCase):
    def setUp(self):
        make = User.objects.create_user
        self.teacher = make(
            email="teacher@example.com", password="x", role=User.Role.TEACHER,
            first_name="Thomas", last_name="Martin",
        )
        self.other_teacher = make(email="other@example.com", password="x", role=User.Role.TEACHER)
        self.admin = make(email="admin@example.com", password="x", role=User.Role.ADMIN)
        self.student = make(
            email="sofia@example.com", password="x", role=User.Role.STUDENT,
            first_name="Sofia", last_name="Ben Ali",
        )
        self.classmate = make(email="amine@example.com", password="x", role=User.Role.STUDENT)
        self.course = Course.objects.create(title="SQL", owner=self.teacher)
        self.other_course = Course.objects.create(title="React", owner=self.other_teacher)

    def question(self, student=None, course=None, **extra):
        fields = {
            "student": student or self.student,
            "course": course or self.course,
            "audio": "voice-questions/q.webm",
            "audio_name": "q.webm",
            "transcript": "What is a left join?",
            "question_text": "What is a left join?",
            "answer": "A left join keeps every row of the left table.",
            "status": VoiceQuestion.Status.ANSWERED,
            **extra,
        }
        return VoiceQuestion.objects.create(**fields)

    def rate(self, question, **payload):
        return self.client.post(f"{URL}{question.pk}/rate/", payload, format="json")

    def escalate(self, question):
        return self.client.post(f"{URL}{question.pk}/escalate/", {}, format="json")

    # Rating
    def test_student_rates_an_answer_helpful(self):
        question = self.question()
        self.client.force_authenticate(self.student)

        response = self.rate(question, rating="helpful", reason="wrong", comment="ignored")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual((body["rating"], body["rating_reason"], body["rating_comment"]), ("helpful", "", ""))
        self.assertIsNotNone(body["rated_at"])

    def test_not_helpful_needs_a_reason(self):
        question = self.question()
        self.client.force_authenticate(self.student)

        missing = self.rate(question, rating="not_helpful")
        invalid = self.rate(question, rating="not_helpful", reason="boring")
        bad_rating = self.rate(question, rating="meh")

        self.assertIn("reason", missing.json()["error"]["fields"])
        self.assertIn("reason", invalid.json()["error"]["fields"])
        self.assertIn("rating", bad_rating.json()["error"]["fields"])

        ok = self.rate(question, rating="not_helpful", reason="incomplete", comment="  No example.  ")
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertEqual(ok.json()["rating_comment"], "No example.")

    def test_only_answered_questions_can_be_rated(self):
        question = self.question(status=VoiceQuestion.Status.ANSWERING, answer="")
        self.client.force_authenticate(self.student)

        response = self.rate(question, rating="helpful")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_students_cannot_rate_questions_of_others(self):
        question = self.question()
        self.client.force_authenticate(self.classmate)

        response = self.rate(question, rating="helpful")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # Escalation
    def test_escalation_requires_a_negative_rating(self):
        question = self.question()
        self.client.force_authenticate(self.student)

        self.assertEqual(self.escalate(question).status_code, status.HTTP_400_BAD_REQUEST)
        self.rate(question, rating="helpful")
        self.assertEqual(self.escalate(question).status_code, status.HTTP_400_BAD_REQUEST)

        self.rate(question, rating="not_helpful", reason="wrong")
        response = self.escalate(question)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["review_status"], "pending")
        self.assertIsNotNone(response.json()["escalated_at"])

    def test_escalated_question_is_locked(self):
        question = self.question(rating="not_helpful", rating_reason="wrong")
        self.client.force_authenticate(self.student)
        self.escalate(question)

        again = self.escalate(question)
        rerate = self.rate(question, rating="helpful")
        with mock.patch("voice_qa.views.answers_enabled", return_value=True):
            reask = self.client.post(
                f"{URL}{question.pk}/ask/", {"question_text": "Changed"}, format="json"
            )

        for response in (again, rerate, reask):
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        question.refresh_from_db()
        self.assertEqual(question.question_text, "What is a left join?")

    def test_asking_again_clears_the_rating(self):
        question = self.question(rating="not_helpful", rating_reason="wrong", rating_comment="x")
        self.client.force_authenticate(self.student)

        with mock.patch("voice_qa.views.answers_enabled", return_value=True), mock.patch(
            "voice_qa.views._enqueue"
        ):
            response = self.client.post(
                f"{URL}{question.pk}/ask/", {"question_text": "What is an inner join?"}, format="json"
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        question.refresh_from_db()
        self.assertEqual((question.rating, question.rating_reason, question.rating_comment), ("", "", ""))

    # Teacher review
    def test_teacher_sees_escalated_questions_of_their_courses_only(self):
        sent = self.question(rating="not_helpful", rating_reason="wrong")
        sent.escalated_at = sent.created_at
        sent.save()
        self.question()  # not sent to the teacher
        elsewhere = self.question(course=self.other_course, rating="not_helpful", rating_reason="wrong")
        elsewhere.escalated_at = elsewhere.created_at
        elsewhere.save()

        self.client.force_authenticate(self.teacher)
        mine = self.client.get(REVIEWS).json()
        self.assertEqual([item["id"] for item in mine["results"]], [str(sent.pk)])
        item = mine["results"][0]
        self.assertEqual(item["student_name"], "Sofia Ben Ali")
        self.assertEqual(item["rating_reason_display"], "Wrong")
        self.assertEqual(item["review_status"], "pending")

        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(REVIEWS).json()["count"], 2)

    def test_students_cannot_open_the_review_list(self):
        self.client.force_authenticate(self.student)

        response = self.client.get(REVIEWS)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_teacher_answers_and_the_student_sees_it(self):
        question = self.question(rating="not_helpful", rating_reason="incomplete")
        question.escalated_at = question.created_at
        question.save()
        self.client.force_authenticate(self.teacher)

        empty = self.client.post(f"{REVIEWS}{question.pk}/answer/", {"teacher_answer": "  "}, format="json")
        self.assertIn("teacher_answer", empty.json()["error"]["fields"])

        response = self.client.post(
            f"{REVIEWS}{question.pk}/answer/",
            {"teacher_answer": " A LEFT JOIN keeps unmatched rows with NULLs. "},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["review_status"], "answered")

        pending = self.client.get(REVIEWS, {"status": "pending"}).json()["count"]
        answered = self.client.get(REVIEWS, {"status": "answered"}).json()["count"]
        self.assertEqual((pending, answered), (0, 1))

        self.client.force_authenticate(self.student)
        body = self.client.get(f"{URL}{question.pk}/").json()
        self.assertEqual(body["teacher_answer"], "A LEFT JOIN keeps unmatched rows with NULLs.")
        self.assertEqual(body["teacher_answered_by_name"], "Thomas Martin")
        self.assertEqual(body["review_status"], "answered")

    def test_other_teachers_cannot_answer(self):
        question = self.question(rating="not_helpful", rating_reason="wrong")
        question.escalated_at = question.created_at
        question.save()
        self.client.force_authenticate(self.other_teacher)

        response = self.client.post(
            f"{REVIEWS}{question.pk}/answer/", {"teacher_answer": "Hi"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_questions_not_sent_cannot_be_answered_by_the_teacher(self):
        question = self.question()
        self.client.force_authenticate(self.teacher)

        response = self.client.post(
            f"{REVIEWS}{question.pk}/answer/", {"teacher_answer": "Hi"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_review_filters_are_validated(self):
        self.client.force_authenticate(self.teacher)

        self.assertEqual(self.client.get(REVIEWS, {"status": "x"}).status_code, 400)
        self.assertEqual(self.client.get(REVIEWS, {"course": "abc"}).status_code, 400)
        self.assertEqual(self.client.get(REVIEWS, {"course": self.course.pk}).status_code, 200)
