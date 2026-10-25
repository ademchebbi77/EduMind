from datetime import timedelta

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from assessments.models import Exercise, ExerciseSubmission
from courses.tests.utils import TemporaryMediaMixin

from .utils import create_course, create_exercise, make_user

LIST_URL = "/api/exercises/"


def detail_url(exercise):
    return f"/api/exercises/{exercise.pk}/"


def exercise_payload(course, **overrides):
    payload = {
        "course": course.pk,
        "title": "Explain overfitting",
        "description": "Short essay",
        "instructions": "Write 200 words about overfitting.",
        "difficulty": "intermediate",
        "points": 20,
        "is_published": True,
    }
    payload.update(overrides)
    return payload


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class ExerciseApiTests(TemporaryMediaMixin, APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)
        self.other_teacher = make_user("other@example.com", User.Role.TEACHER)
        self.student = make_user("student@example.com", User.Role.STUDENT)
        self.course = create_course(self.teacher, title="Machine learning")
        self.other_course = create_course(self.other_teacher)
        self.client.force_login(self.teacher)

    def test_crud(self):
        response = self.client.post(LIST_URL, exercise_payload(self.course), format="json")
        self.assertEqual(response.status_code, 201, response.json())
        exercise_id = response.json()["id"]
        self.assertEqual(response.json()["course_title"], "Machine learning")

        url = f"/api/exercises/{exercise_id}/"
        self.assertEqual(self.client.get(url).json()["difficulty_display"], "Intermediate")

        response = self.client.patch(url, {"points": 30}, format="json")
        self.assertEqual(response.json()["points"], 30)
        self.assertEqual(response.json()["title"], "Explain overfitting")

        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertFalse(Exercise.objects.exists())

    def test_validation(self):
        cases = [
            ({"instructions": "  "}, "instructions"),
            ({"title": ""}, "title"),
            ({"points": 0}, "points"),
            ({"difficulty": "hard"}, "difficulty"),
            ({"course": 999999}, "course"),
            ({"course": self.other_course.pk}, "course"),
            ({"due_at": (timezone.now() - timedelta(days=1)).isoformat()}, "due_at"),
        ]
        for overrides, field in cases:
            with self.subTest(field=field):
                response = self.client.post(
                    LIST_URL, {**exercise_payload(self.course), **overrides}, format="json"
                )
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json()["error"]["fields"])

    def test_student_visibility_and_permissions(self):
        published = create_exercise(self.course, title="Published")
        draft = create_exercise(self.course, title="Draft", is_published=False)
        self.client.force_login(self.student)

        titles = {item["title"] for item in self.client.get(LIST_URL).json()["results"]}
        self.assertEqual(titles, {"Published"})
        self.assertEqual(self.client.get(detail_url(draft)).status_code, 404)
        self.assertEqual(
            self.client.patch(detail_url(published), {"title": "X"}, format="json").status_code,
            403,
        )
        self.assertEqual(
            self.client.post(LIST_URL, exercise_payload(self.course), format="json").status_code,
            403,
        )

    def test_non_owner_teacher_cannot_edit(self):
        exercise = create_exercise(self.course)
        self.client.force_login(self.other_teacher)

        self.assertEqual(self.client.delete(detail_url(exercise)).status_code, 403)

    def test_nested_course_route_and_filters(self):
        create_exercise(self.course, title="Beginner one", difficulty="beginner")
        create_exercise(self.course, title="Advanced one", difficulty="advanced")
        create_exercise(self.other_course, title="Elsewhere")

        nested = self.client.get(f"/api/courses/{self.course.pk}/exercises/").json()
        self.assertEqual(nested["count"], 2)
        filtered = self.client.get(f"{LIST_URL}?difficulty=advanced").json()
        self.assertEqual([item["title"] for item in filtered["results"]], ["Advanced one"])
        self.assertEqual(self.client.get("/api/courses/999999/exercises/").status_code, 404)


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class ExerciseSubmissionTests(TemporaryMediaMixin, APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)
        self.other_teacher = make_user("other@example.com", User.Role.TEACHER)
        self.student = make_user("student@example.com", User.Role.STUDENT)
        self.course = create_course(self.teacher)
        self.exercise = create_exercise(self.course, points=20)
        self.submit_url = f"/api/exercises/{self.exercise.pk}/submission/"
        self.list_url = f"/api/exercises/{self.exercise.pk}/submissions/"
        self.client.force_login(self.student)

    def grade_url(self, submission_id):
        return f"{self.list_url}{submission_id}/"

    def test_submit_then_update_keeps_single_submission(self):
        first = self.client.put(self.submit_url, {"content": "Draft answer"}, format="json")
        second = self.client.put(self.submit_url, {"content": "Final answer"}, format="json")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(ExerciseSubmission.objects.get().content, "Final answer")

        detail = self.client.get(f"/api/exercises/{self.exercise.pk}/").json()
        self.assertEqual(detail["my_submission"]["content"], "Final answer")
        self.assertEqual(detail["my_submission_status"], "submitted")

    def test_empty_submission_rejected(self):
        response = self.client.put(self.submit_url, {"content": "   "}, format="json")

        self.assertEqual(response.status_code, 400)

    def test_teacher_grades_and_student_sees_grade(self):
        submission_id = self.client.put(
            self.submit_url, {"content": "My answer"}, format="json"
        ).json()["id"]

        self.client.force_login(self.teacher)
        listing = self.client.get(self.list_url).json()
        self.assertEqual(listing["count"], 1)
        self.assertEqual(listing["results"][0]["content"], "My answer")

        too_high = self.client.patch(self.grade_url(submission_id), {"score": 21}, format="json")
        self.assertEqual(too_high.status_code, 400)

        graded = self.client.patch(
            self.grade_url(submission_id), {"score": 15, "feedback": "Good"}, format="json"
        )
        self.assertEqual(graded.status_code, 200)
        self.assertTrue(graded.json()["is_graded"])

        self.client.force_login(self.student)
        detail = self.client.get(f"/api/exercises/{self.exercise.pk}/").json()
        self.assertEqual(detail["my_submission"]["score"], 15)
        self.assertEqual(detail["my_submission"]["feedback"], "Good")
        self.assertEqual(detail["my_submission_status"], "graded")
        listing = self.client.get(LIST_URL).json()["results"][0]
        self.assertEqual((listing["my_submission_status"], listing["my_score"]), ("graded", 15))

        locked = self.client.put(self.submit_url, {"content": "Changed"}, format="json")
        self.assertEqual(locked.status_code, 400)

    def test_cannot_lower_points_below_existing_grade(self):
        submission = ExerciseSubmission.objects.create(
            exercise=self.exercise, student=self.student, content="x", score=18,
            graded_at=timezone.now(),
        )
        self.client.force_login(self.teacher)

        response = self.client.patch(
            f"/api/exercises/{self.exercise.pk}/", {"points": 10}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIsNotNone(submission.pk)

    def test_permissions(self):
        submission_id = self.client.put(
            self.submit_url, {"content": "Answer"}, format="json"
        ).json()["id"]

        # Students cannot list or grade submissions.
        self.assertEqual(self.client.get(self.list_url).status_code, 403)
        self.assertEqual(
            self.client.patch(self.grade_url(submission_id), {"score": 1}, format="json").status_code,
            403,
        )

        # Another teacher cannot see or grade them either.
        self.client.force_login(self.other_teacher)
        self.assertEqual(self.client.get(self.list_url).status_code, 403)
        self.assertEqual(
            self.client.patch(self.grade_url(submission_id), {"score": 1}, format="json").status_code,
            403,
        )

        # Teachers do not submit answers.
        self.client.force_login(self.teacher)
        self.assertEqual(
            self.client.put(self.submit_url, {"content": "x"}, format="json").status_code, 403
        )
        self.assertEqual(self.client.patch(self.grade_url(999999), {"score": 1}, format="json").status_code, 404)

    def test_late_flag(self):
        self.exercise.due_at = timezone.now() - timedelta(hours=1)
        self.exercise.save()

        data = self.client.put(self.submit_url, {"content": "Late"}, format="json").json()

        self.assertTrue(data["is_late"])
