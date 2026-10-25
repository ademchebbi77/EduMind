from datetime import timedelta

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from assessments.models import QuizAttempt
from assessments.tests.utils import create_quiz
from courses.tests.utils import TemporaryMediaMixin, create_course

from ..models import LiveSession, SessionEnrollment

URL = "/api/sessions/recommended/"


def make_user(email, role):
    return User.objects.create_user(
        email=email,
        password="StrongPass123!",
        first_name=email.split("@")[0].title(),
        last_name="Test",
        role=role,
    )


def make_session(creator, title, *, days=5, session_type="course", course=None, status="scheduled", description=""):
    starts_at = timezone.now() + timedelta(days=days)
    return LiveSession.objects.create(
        title=title,
        description=description,
        session_type=session_type,
        status=status,
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=1),
        created_by=creator,
        course=course,
    )


def enroll(student, session, status="confirmed"):
    return SessionEnrollment.objects.create(session=session, student=student, status=status)


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class RecommendationApiTestCase(TemporaryMediaMixin, APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)
        self.student = make_user("student@example.com", User.Role.STUDENT)
        self.other_student = make_user("other@example.com", User.Role.STUDENT)
        self.admin = make_user("admin@example.com", User.Role.ADMIN)


class RecommendationRankingTests(RecommendationApiTestCase):
    def test_history_similarity_ranks_matching_session_first(self):
        past = make_session(self.teacher, "Atelier Python avancé", days=-30, session_type="training")
        enroll(self.student, past)
        python_session = make_session(self.teacher, "Python pour la data science", days=5)
        painting_session = make_session(self.teacher, "Peinture à l'huile", days=5)

        self.client.force_login(self.student)
        response = self.client.get(URL)

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data[0]["title"], python_session.title)
        self.assertGreater(data[0]["match_score"], data[1]["match_score"])
        self.assertEqual(data[0]["recommendation_reason"], "Correspond à votre historique de formations")
        self.assertEqual(data[1]["title"], painting_session.title)

    def test_quiz_attempt_boosts_sessions_of_the_same_course(self):
        statistics = create_course(self.teacher, title="Statistiques")
        literature = create_course(self.teacher, title="Littérature")
        quiz = create_quiz(statistics, title="Probabilités")
        QuizAttempt.objects.create(
            quiz=quiz,
            student=self.student,
            status=QuizAttempt.Status.SUBMITTED,
        )
        stats_session = make_session(self.teacher, "Révision des probabilités", days=4, course=statistics)
        literature_session = make_session(self.teacher, "Analyse de texte", days=4, course=literature)

        self.client.force_login(self.student)
        data = self.client.get(URL).json()

        self.assertEqual(data[0]["title"], stats_session.title)
        self.assertIn(statistics.title, data[0]["recommendation_reason"])
        self.assertEqual(data[1]["title"], literature_session.title)

    def test_cold_start_falls_back_on_popularity(self):
        popular = make_session(self.teacher, "Initiation à la robotique", days=5)
        quiet = make_session(self.teacher, "Atelier d'écriture", days=5)
        enroll(self.other_student, popular)
        enroll(make_user("third@example.com", User.Role.STUDENT), popular)

        self.client.force_login(self.student)
        data = self.client.get(URL).json()

        self.assertEqual(data[0]["title"], popular.title)
        self.assertEqual(data[0]["recommendation_reason"], "Populaire : 2 étudiants inscrits")
        self.assertEqual(data[1]["title"], quiet.title)
        self.assertTrue(0 <= data[0]["match_score"] <= 100)


class RecommendationFilteringTests(RecommendationApiTestCase):
    def test_already_enrolled_session_is_excluded(self):
        enrolled = make_session(self.teacher, "Python débutant", days=3)
        enroll(self.student, enrolled)
        other = make_session(self.teacher, "Python confirmé", days=3)

        self.client.force_login(self.student)
        data = self.client.get(URL).json()

        self.assertEqual([item["title"] for item in data], [other.title])

    def test_past_and_cancelled_sessions_are_excluded(self):
        make_session(self.teacher, "Session passée", days=-2)
        make_session(self.teacher, "Session annulée", days=3, status="cancelled")
        upcoming = make_session(self.teacher, "Session à venir", days=3)

        self.client.force_login(self.student)
        data = self.client.get(URL).json()

        self.assertEqual([item["title"] for item in data], [upcoming.title])

    def test_empty_schedule_returns_empty_list(self):
        self.client.force_login(self.student)
        response = self.client.get(URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])


class RecommendationAccessTests(RecommendationApiTestCase):
    def test_teachers_and_admins_are_rejected(self):
        make_session(self.teacher, "Session à venir", days=3)
        for user in (self.teacher, self.admin):
            self.client.force_login(user)
            response = self.client.get(URL)
            self.assertEqual(response.status_code, 403, user.role)

    def test_anonymous_user_is_rejected(self):
        self.assertEqual(self.client.get(URL).status_code, 401)

    def test_limit_is_validated_and_applied(self):
        for index in range(3):
            make_session(self.teacher, f"Session {index}", days=index + 1)

        self.client.force_login(self.student)
        self.assertEqual(len(self.client.get(URL, {"limit": 2}).json()), 2)
        self.assertEqual(self.client.get(URL, {"limit": 0}).status_code, 400)
        self.assertEqual(self.client.get(URL, {"limit": 21}).status_code, 400)
        self.assertEqual(self.client.get(URL, {"limit": "abc"}).status_code, 400)
