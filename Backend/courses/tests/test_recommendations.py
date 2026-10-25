import tempfile
import time
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from courses.ml_recommendations import (
    CourseRecommender,
    build_model_state,
    get_recommender,
    model_is_stale,
    train_recommender,
)
from courses.models import Category, Course, Enrollment

RECOMMENDATION_URL = "/api/courses/ml-recommendations/"


class RecommendationTestBase(APITestCase):
    password = "StrongPass123!"

    def setUp(self):
        self._temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self._temporary.cleanup)
        self._settings = override_settings(
            PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
            RECOMMENDATION_MODEL_PATH=(
                Path(self._temporary.name) / "recommendations.pkl"
            ),
            RECOMMENDATION_AUTO_RETRAIN=False,
        )
        self._settings.enable()
        self.addCleanup(self._settings.disable)
        cache.clear()
        self.addCleanup(cache.clear)
        self._seed()

    def _user(self, email, role, first_name="Test"):
        return User.objects.create_user(
            email=email,
            password=self.password,
            first_name=first_name,
            role=role,
        )

    def _course(self, title, description, category, tags):
        return Course.objects.create(
            owner=self.teacher,
            title=title,
            description=description,
            category=category,
            tags=tags,
            type=Course.Type.PDF,
        )

    def _seed(self):
        self.teacher = self._user(
            "teacher@example.com", User.Role.TEACHER, "Thomas"
        )
        self.student = self._user(
            "student@example.com", User.Role.STUDENT, "Sam"
        )
        self.peer = self._user("peer@example.com", User.Role.STUDENT, "Pia")
        self.other_peer = self._user(
            "peer2@example.com", User.Role.STUDENT, "Paul"
        )
        self.art_student = self._user(
            "art@example.com", User.Role.STUDENT, "Ada"
        )
        self.new_student = self._user(
            "new@example.com", User.Role.STUDENT, "Nina"
        )

        self.programming = Category.objects.create(name="Programming")
        self.art = Category.objects.create(name="Art")

        self.python = self._course(
            "Python Basics",
            "Variables, loops and functions in Python.",
            self.programming,
            "python, beginner",
        )
        self.advanced = self._course(
            "Advanced Python",
            "Decorators, generators and testing in Python.",
            self.programming,
            "python, advanced",
        )
        self.django = self._course(
            "Django Web",
            "Build web applications with Django and Python.",
            self.programming,
            "django, web, python",
        )
        self.data = self._course(
            "Data Science",
            "Analyse data with pandas, numpy and Python.",
            self.programming,
            "data, pandas",
        )
        self.watercolor = self._course(
            "Watercolor",
            "Paint landscapes with watercolor techniques.",
            self.art,
            "painting, color",
        )
        self.guitar = self._course(
            "Guitar",
            "Learn guitar chords and rhythm.",
            self.art,
            "music, guitar",
        )

        Enrollment.objects.create(course=self.python, student=self.student)
        Enrollment.objects.create(course=self.python, student=self.peer)
        Enrollment.objects.create(course=self.advanced, student=self.peer)
        Enrollment.objects.create(course=self.python, student=self.other_peer)
        Enrollment.objects.create(course=self.django, student=self.other_peer)
        Enrollment.objects.create(course=self.watercolor, student=self.art_student)


class RecommendationApiTests(RecommendationTestBase):
    def test_student_receives_hybrid_recommendations(self):
        train_recommender()
        self.client.force_login(self.student)

        response = self.client.get(RECOMMENDATION_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["algorithm"], "hybrid")
        self.assertLess(data["computed_in_ms"], 100)
        self.assertTrue(data["recommendations"])

        ids = [item["id"] for item in data["recommendations"]]
        self.assertNotIn(self.python.id, ids)
        self.assertNotIn(self.watercolor.id, ids)
        self.assertNotIn(self.guitar.id, ids)
        self.assertTrue(
            {self.advanced.id, self.django.id, self.data.id} & set(ids)
        )

        confidences = []
        for item in data["recommendations"]:
            self.assertIn("title", item)
            self.assertIn("description", item)
            self.assertIn("thumbnail_url", item)
            self.assertIn("reason", item)
            self.assertEqual(item["category"], "Programming")
            self.assertGreaterEqual(item["confidence"], 0)
            self.assertLessEqual(item["confidence"], 1)
            confidences.append(item["confidence"])
        self.assertEqual(confidences, sorted(confidences, reverse=True))

    def test_cold_start_returns_popular_courses(self):
        train_recommender()
        self.client.force_login(self.new_student)

        response = self.client.get(RECOMMENDATION_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["algorithm"], "popular")
        self.assertEqual(data["recommendations"][0]["id"], self.python.id)
        self.assertTrue(
            all(item["reason"] for item in data["recommendations"])
        )

    def test_teacher_cannot_request_recommendations(self):
        self.client.force_login(self.teacher)

        response = self.client.get(RECOMMENDATION_URL)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_limit_is_respected_and_validated(self):
        train_recommender()
        self.client.force_login(self.student)

        limited = self.client.get(RECOMMENDATION_URL, {"limit": 2})
        self.assertEqual(limited.status_code, status.HTTP_200_OK)
        self.assertEqual(len(limited.json()["recommendations"]), 2)

        for invalid in ("abc", "0", "21"):
            with self.subTest(limit=invalid):
                response = self.client.get(
                    RECOMMENDATION_URL, {"limit": invalid}
                )
                self.assertEqual(
                    response.status_code, status.HTTP_400_BAD_REQUEST
                )

    def test_live_enrollment_is_excluded_after_training(self):
        train_recommender()
        Enrollment.objects.create(course=self.advanced, student=self.student)
        self.client.force_login(self.student)

        response = self.client.get(RECOMMENDATION_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.json()["recommendations"]]
        self.assertNotIn(self.advanced.id, ids)

    def test_full_course_is_not_recommended(self):
        self.python.max_students = 3
        self.python.save(update_fields=["max_students"])
        train_recommender()
        self.client.force_login(self.new_student)

        response = self.client.get(RECOMMENDATION_URL)

        ids = [item["id"] for item in response.json()["recommendations"]]
        self.assertNotIn(self.python.id, ids)

    def test_new_course_is_recommended_from_content(self):
        new_course = self._course(
            "Python Testing Workshop",
            "Write automated tests for Python applications.",
            self.programming,
            "python, testing",
        )
        train_recommender()
        self.client.force_login(self.student)

        response = self.client.get(RECOMMENDATION_URL, {"limit": 20})

        ids = [item["id"] for item in response.json()["recommendations"]]
        self.assertIn(new_course.id, ids)

    def test_engine_failure_falls_back_to_popular_courses(self):
        self.client.force_login(self.student)

        with patch(
            "courses.views.recommend_courses",
            side_effect=RuntimeError("model exploded"),
        ):
            response = self.client.get(RECOMMENDATION_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["algorithm"], "popular")
        self.assertTrue(data["recommendations"])
        ids = [item["id"] for item in data["recommendations"]]
        self.assertNotIn(self.python.id, ids)


class RecommendationServiceTests(RecommendationTestBase):
    def test_state_contains_course_and_user_features(self):
        state = build_model_state()

        self.assertEqual(state["course_count"], 6)
        self.assertEqual(state["student_count"], 4)
        self.assertEqual(state["enrollment_count"], 6)
        self.assertEqual(len(state["course_ids"]), 6)
        self.assertEqual(state["course_similarity"].shape, (6, 6))
        self.assertEqual(state["user_similarity"].shape, (4, 4))
        self.assertEqual(state["preferred_categories"][self.student.id], "Programming")

    def test_recommender_excludes_enrolled_courses(self):
        recommender = CourseRecommender(build_model_state())

        results = recommender.recommend(self.student.id, limit=5)
        ids = [item["course_id"] for item in results]

        self.assertNotIn(self.python.id, ids)
        self.assertNotIn(self.watercolor.id, ids)
        self.assertTrue(
            {self.advanced.id, self.django.id, self.data.id} & set(ids)
        )
        self.assertTrue(
            any(
                "Based on your enrollment in Python Basics" in item["reason"]
                for item in results
            )
        )

    def test_model_is_stale_after_retrain_window(self):
        state = build_model_state()
        self.assertFalse(model_is_stale(state))

        state["trained_at"] = (
            timezone.now() - timedelta(days=8)
        ).isoformat()
        self.assertTrue(model_is_stale(state))

    def test_persisted_model_is_reused(self):
        train_recommender()
        path = Path(settings.RECOMMENDATION_MODEL_PATH)
        self.assertTrue(path.exists())

        cache.clear()
        Enrollment.objects.all().delete()
        recommender = get_recommender()

        self.assertTrue(recommender.recommend(self.student.id, limit=5))

    def test_retrain_command_persists_model(self):
        call_command("retrain_recommendations")

        self.assertTrue(Path(settings.RECOMMENDATION_MODEL_PATH).exists())

    def test_recommendation_computation_is_fast(self):
        recommender = CourseRecommender(build_model_state())
        recommender.recommend(self.student.id, limit=5)

        started = time.perf_counter()
        for _ in range(20):
            recommender.recommend(self.student.id, limit=5)
        average_ms = (time.perf_counter() - started) * 1000 / 20

        self.assertLess(average_ms, 100)
