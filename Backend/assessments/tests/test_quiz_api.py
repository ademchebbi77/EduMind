from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import User
from assessments.models import AnswerOption, Question, Quiz
from courses.tests.utils import TemporaryMediaMixin

from .utils import create_course, create_quiz, make_user, question_payload, quiz_payload

LIST_URL = "/api/quizzes/"


def detail_url(quiz):
    return f"/api/quizzes/{quiz.pk}/"


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class QuizApiTestCase(TemporaryMediaMixin, APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)
        self.other_teacher = make_user("other@example.com", User.Role.TEACHER)
        self.admin = make_user("admin@example.com", User.Role.ADMIN)
        self.student = make_user("student@example.com", User.Role.STUDENT)
        self.course = create_course(self.teacher, title="Machine learning")
        self.other_course = create_course(self.other_teacher, title="Statistics")
        self.client.force_login(self.teacher)


class QuizCreateTests(QuizApiTestCase):
    def test_create_quiz_with_questions(self):
        payload = quiz_payload(
            self.course,
            questions=[
                question_payload(explanation="Basic addition."),
                question_payload(
                    text="Pick the primes",
                    type="multiple_choice",
                    points=3,
                    options=[
                        {"text": "2", "is_correct": True},
                        {"text": "3", "is_correct": True},
                        {"text": "4", "is_correct": False},
                    ],
                ),
                question_payload(
                    text="The sky is blue",
                    type="true_false",
                    options=[
                        {"text": "True", "is_correct": True},
                        {"text": "False", "is_correct": False},
                    ],
                ),
            ],
        )

        response = self.client.post(LIST_URL, payload, format="json")

        self.assertEqual(response.status_code, 201, response.json())
        data = response.json()
        self.assertEqual(data["course"], self.course.pk)
        self.assertEqual(data["course_title"], "Machine learning")
        self.assertEqual(data["question_count"], 3)
        self.assertEqual(data["total_points"], 5)
        self.assertEqual([q["text"] for q in data["questions"]][1], "Pick the primes")
        self.assertTrue(data["questions"][0]["options"][1]["is_correct"])
        quiz = Quiz.objects.get(pk=data["id"])
        self.assertEqual(quiz.questions.count(), 3)
        self.assertEqual(AnswerOption.objects.filter(question__quiz=quiz).count(), 7)

    def test_rejects_nonexistent_course(self):
        response = self.client.post(
            LIST_URL, {**quiz_payload(self.course), "course": 999999}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("course", response.json()["error"]["fields"])

    def test_teacher_cannot_add_quiz_to_someone_elses_course(self):
        response = self.client.post(LIST_URL, quiz_payload(self.other_course), format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("own", response.json()["error"]["fields"]["course"][0])
        self.assertFalse(Quiz.objects.exists())

    def test_admin_can_add_quiz_to_any_course(self):
        self.client.force_login(self.admin)

        response = self.client.post(LIST_URL, quiz_payload(self.other_course), format="json")

        self.assertEqual(response.status_code, 201)

    def test_student_cannot_create(self):
        self.client.force_login(self.student)

        response = self.client.post(LIST_URL, quiz_payload(self.course), format="json")

        self.assertEqual(response.status_code, 403)

    def test_requires_authentication(self):
        self.client.logout()

        self.assertEqual(self.client.get(LIST_URL).status_code, 401)

    def assert_invalid(self, payload, field="questions"):
        response = self.client.post(LIST_URL, payload, format="json")
        self.assertEqual(response.status_code, 400, response.json())
        self.assertIn(field, response.json()["error"]["fields"])
        self.assertFalse(Quiz.objects.exists())
        return response.json()["error"]["fields"][field]

    def test_validation_rules(self):
        self.assert_invalid(quiz_payload(self.course, questions=[]))
        self.assert_invalid(quiz_payload(self.course, title="  "), field="title")
        self.assert_invalid(quiz_payload(self.course, difficulty="expert"), field="difficulty")
        self.assert_invalid(quiz_payload(self.course, passing_score=101), field="passing_score")
        self.assert_invalid(quiz_payload(self.course, duration_minutes=0), field="duration_minutes")
        self.assert_invalid(quiz_payload(self.course, max_attempts=0), field="max_attempts")

    def test_question_validation_rules(self):
        cases = [
            question_payload(points=0),
            question_payload(text=""),
            question_payload(type="essay"),
            question_payload(options=[{"text": "Only", "is_correct": True}]),
            question_payload(
                options=[{"text": "A", "is_correct": False}, {"text": "B", "is_correct": False}]
            ),
            question_payload(
                options=[{"text": "A", "is_correct": True}, {"text": "B", "is_correct": True}]
            ),
            question_payload(
                options=[{"text": "Same", "is_correct": True}, {"text": "same", "is_correct": False}]
            ),
            question_payload(
                type="true_false",
                options=[
                    {"text": "True", "is_correct": True},
                    {"text": "False", "is_correct": False},
                    {"text": "Maybe", "is_correct": False},
                ],
            ),
        ]
        for question in cases:
            with self.subTest(question=question):
                self.assert_invalid(quiz_payload(self.course, questions=[question]))


class QuizVisibilityTests(QuizApiTestCase):
    def setUp(self):
        super().setUp()
        self.published = create_quiz(self.course, title="Published")
        self.draft = create_quiz(self.course, title="Draft", is_published=False)
        self.other_draft = create_quiz(self.other_course, title="Other draft", is_published=False)

    def titles(self, response):
        return {item["title"] for item in response.json()["results"]}

    def test_student_only_sees_published(self):
        self.client.force_login(self.student)

        response = self.client.get(LIST_URL)

        self.assertEqual(self.titles(response), {"Published"})
        self.assertEqual(self.client.get(detail_url(self.draft)).status_code, 404)

    def test_teacher_sees_own_drafts_only(self):
        response = self.client.get(LIST_URL)

        self.assertEqual(self.titles(response), {"Published", "Draft"})
        self.assertEqual(self.client.get(detail_url(self.other_draft)).status_code, 404)

    def test_admin_sees_everything(self):
        self.client.force_login(self.admin)

        self.assertEqual(len(self.client.get(LIST_URL).json()["results"]), 3)

    def test_student_detail_hides_correct_answers_and_explanations(self):
        self.client.force_login(self.student)

        data = self.client.get(detail_url(self.published)).json()

        question = data["questions"][0]
        self.assertNotIn("explanation", question)
        for option in question["options"]:
            self.assertEqual(set(option), {"id", "text"})
        self.assertNotIn("is_correct", str(data))

    def test_non_owner_teacher_gets_public_view(self):
        self.client.force_login(self.other_teacher)

        data = self.client.get(detail_url(self.published)).json()

        self.assertNotIn("is_correct", str(data))

    def test_owner_detail_includes_answers(self):
        data = self.client.get(detail_url(self.published)).json()

        self.assertTrue(data["questions"][0]["options"][0]["is_correct"])
        self.assertEqual(data["questions"][0]["explanation"], "Explanation 1")

    def test_filters_and_search(self):
        create_quiz(self.course, title="Neural networks", difficulty="advanced")

        def count(query):
            return self.client.get(f"{LIST_URL}?{query}").json()["count"]

        self.assertEqual(count("difficulty=advanced"), 1)
        self.assertEqual(count("search=neural"), 1)
        self.assertEqual(count(f"course={self.course.pk}"), 3)
        self.assertEqual(count("is_published=false"), 1)
        ordered = self.client.get(f"{LIST_URL}?ordering=-difficulty_rank").json()["results"]
        self.assertEqual(ordered[0]["difficulty"], "advanced")

    def test_invalid_filters(self):
        for query in ("difficulty=expert", "course=abc", "course=999999", "is_published=maybe"):
            with self.subTest(query=query):
                self.assertEqual(self.client.get(f"{LIST_URL}?{query}").status_code, 400)

    def test_list_reports_question_count_and_points(self):
        create_quiz(
            self.course,
            title="Big",
            questions=[
                ("single_choice", 2, [("A", True), ("B", False)]),
                ("true_false", 3, [("True", True), ("False", False)]),
            ],
        )
        results = self.client.get(f"{LIST_URL}?search=Big").json()["results"]

        self.assertEqual(results[0]["question_count"], 2)
        self.assertEqual(results[0]["total_points"], 5)
        self.assertNotIn("questions", results[0])

    def test_course_nested_route(self):
        response = self.client.get(f"/api/courses/{self.course.pk}/quizzes/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.titles(response), {"Published", "Draft"})
        self.assertEqual(self.client.get("/api/courses/999999/quizzes/").status_code, 404)

    def test_existing_course_routes_still_work(self):
        self.assertEqual(self.client.get("/api/courses/").status_code, 200)
        self.assertEqual(self.client.get(f"/api/courses/{self.course.pk}/").status_code, 200)


class QuizUpdateDeleteTests(QuizApiTestCase):
    def setUp(self):
        super().setUp()
        self.quiz = create_quiz(
            self.course,
            questions=[
                ("single_choice", 1, [("A", True), ("B", False)]),
                ("single_choice", 2, [("C", False), ("D", True)]),
            ],
        )
        self.client.force_login(self.teacher)

    def current_payload(self):
        return self.client.get(detail_url(self.quiz)).json()

    def test_patch_without_questions_keeps_them(self):
        response = self.client.patch(detail_url(self.quiz), {"title": "Renamed"}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["title"], "Renamed")
        self.assertEqual(self.quiz.questions.count(), 2)

    def test_put_updates_adds_and_removes_questions(self):
        data = self.current_payload()
        first, second = data["questions"]
        first["text"] = "Edited question"
        first["options"][1]["text"] = "B edited"
        first["options"].append({"text": "New option", "is_correct": False})
        payload = {
            **data,
            "questions": [first, question_payload(text="Brand new")],
        }

        response = self.client.put(detail_url(self.quiz), payload, format="json")

        self.assertEqual(response.status_code, 200, response.json())
        texts = [q["text"] for q in response.json()["questions"]]
        self.assertEqual(texts, ["Edited question", "Brand new"])
        self.assertFalse(Question.objects.filter(pk=second["id"]).exists())
        kept = Question.objects.get(pk=first["id"])
        self.assertEqual(
            list(kept.options.values_list("text", flat=True)),
            ["A", "B edited", "New option"],
        )

    def test_rejects_question_ids_from_another_quiz(self):
        other = create_quiz(self.course, title="Other")
        foreign = other.questions.first()
        payload = self.current_payload()
        payload["questions"][0]["id"] = foreign.pk

        response = self.client.put(detail_url(self.quiz), payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(foreign.quiz_id, Question.objects.get(pk=foreign.pk).quiz_id)

    def test_rejects_option_ids_from_another_question(self):
        payload = self.current_payload()
        payload["questions"][0]["options"][0]["id"] = payload["questions"][1]["options"][0]["id"]

        response = self.client.put(detail_url(self.quiz), payload, format="json")

        self.assertEqual(response.status_code, 400)

    def test_invalid_update_is_atomic(self):
        payload = self.current_payload()
        payload["title"] = "Should not persist"
        payload["questions"][1]["options"] = [{"text": "Only", "is_correct": True}]

        response = self.client.put(detail_url(self.quiz), payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.quiz.refresh_from_db()
        self.assertEqual(self.quiz.title, "Quiz")

    def test_non_owner_cannot_update_or_delete(self):
        self.client.force_login(self.other_teacher)

        self.assertEqual(
            self.client.patch(detail_url(self.quiz), {"title": "X"}, format="json").status_code,
            403,
        )
        self.assertEqual(self.client.delete(detail_url(self.quiz)).status_code, 403)

    def test_cannot_move_quiz_to_foreign_course(self):
        response = self.client.patch(
            detail_url(self.quiz), {"course": self.other_course.pk}, format="json"
        )

        self.assertEqual(response.status_code, 400)

    def test_delete_cascades_questions_and_options(self):
        response = self.client.delete(detail_url(self.quiz))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Question.objects.exists())
        self.assertFalse(AnswerOption.objects.exists())

    def test_deleting_course_deletes_its_quizzes(self):
        self.course.delete()

        self.assertFalse(Quiz.objects.exists())

    def test_missing_quiz_returns_404(self):
        response = self.client.get("/api/quizzes/999999/")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"]["code"], "not_found")
