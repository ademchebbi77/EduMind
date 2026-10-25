from datetime import datetime, time, timedelta

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User

from ..forecast import forecast_session, forecast_upcoming
from ..models import LiveSession, SessionEnrollment
from ..scheduling import best_time_slots


def make_user(email, role):
    return User.objects.create_user(
        email=email,
        password="StrongPass123!",
        first_name=email.split("@")[0].title(),
        last_name="Test",
        role=role,
    )


def make_session(
    creator,
    title,
    *,
    starts_at,
    session_type="training",
    status="scheduled",
    course=None,
    created_at=None,
):
    session = LiveSession.objects.create(
        title=title,
        session_type=session_type,
        status=status,
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=2),
        created_by=creator,
        course=course,
    )
    if created_at is not None:
        LiveSession.objects.filter(pk=session.pk).update(created_at=created_at)
    return session


def enroll(students, session, status="confirmed"):
    for student in students:
        SessionEnrollment.objects.create(
            session=session, student=student, status=status
        )


class InsightsTestCase(APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)
        self.admin = make_user("admin@example.com", User.Role.ADMIN)
        self.students = [
            make_user(f"student{index}@example.com", User.Role.STUDENT)
            for index in range(8)
        ]


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class ForecastTests(InsightsTestCase):
    def test_forecast_uses_comparable_history(self):
        now = timezone.now()
        for index, size in enumerate((6, 5, 4, 7)):
            starts_at = now - timedelta(days=20 + index * 15)
            past = make_session(
                self.teacher,
                f"Formation passée {index}",
                starts_at=starts_at,
                created_at=starts_at - timedelta(days=20),
            )
            enroll(self.students[:size], past)

        upcoming = make_session(
            self.teacher,
            "Formation à venir",
            starts_at=now + timedelta(days=5),
            created_at=now - timedelta(days=20),
        )
        enroll(self.students[:2], upcoming)

        forecast = forecast_session(upcoming, now=now)

        self.assertGreaterEqual(forecast.expected_enrollments, forecast.current_enrollments)
        self.assertEqual(forecast.current_enrollments, 2)
        self.assertEqual(forecast.sample_size, 4)
        self.assertEqual(forecast.confidence, "high")
        self.assertLessEqual(forecast.minimum, forecast.expected_enrollments)
        self.assertGreaterEqual(forecast.maximum, forecast.expected_enrollments)
        self.assertTrue(forecast.reasons)

    def test_forecast_without_history_returns_current_count(self):
        now = timezone.now()
        upcoming = make_session(
            self.teacher,
            "Première formation",
            starts_at=now + timedelta(days=3),
            created_at=now - timedelta(days=3),
        )
        enroll(self.students[:1], upcoming)

        forecast = forecast_session(upcoming, now=now)

        self.assertEqual(forecast.expected_enrollments, 1)
        self.assertEqual(forecast.sample_size, 0)
        self.assertEqual(forecast.confidence, "low")

    def test_cancelled_sessions_are_ignored(self):
        now = timezone.now()
        cancelled = make_session(
            self.teacher,
            "Annulée",
            starts_at=now - timedelta(days=10),
            status="cancelled",
        )
        enroll(self.students[:5], cancelled)

        self.assertEqual(forecast_upcoming([cancelled], now=now), [])


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class BestTimeTests(InsightsTestCase):
    def test_most_filled_slot_comes_first(self):
        now = timezone.now()
        tuesday_evening = _past_datetime(1, 18, now)
        thursday_morning = _past_datetime(3, 10, now)

        first = make_session(self.teacher, "Python 1", starts_at=tuesday_evening)
        enroll(self.students[:6], first)
        second = make_session(
            self.teacher, "Python 2", starts_at=tuesday_evening - timedelta(days=7)
        )
        enroll(self.students[:5], second)
        third = make_session(self.teacher, "Python 3", starts_at=thursday_morning)
        enroll(self.students[:1], third)

        slots = best_time_slots(now=now)

        self.assertEqual(slots[0].weekday, 1)
        self.assertEqual(slots[0].hour, 18)
        self.assertEqual(slots[0].weekday_label, "Mardi")
        self.assertGreater(slots[0].score, slots[1].score)

    def test_empty_history_returns_no_slots(self):
        self.assertEqual(best_time_slots(now=timezone.now()), [])


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class InsightsApiTests(InsightsTestCase):
    def setUp(self):
        super().setUp()
        now = timezone.now()
        past = make_session(
            self.teacher, "Formation passée", starts_at=now - timedelta(days=14)
        )
        enroll(self.students[:4], past)
        make_session(
            self.teacher,
            "Formation à venir",
            starts_at=now + timedelta(days=4),
            created_at=now - timedelta(days=10),
        )

    def test_teacher_receives_forecast(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.get("/api/sessions/enrollment-forecast/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 1)
        self.assertIn("session", payload[0])
        self.assertIn("expected_enrollments", payload[0]["forecast"])

    def test_teacher_receives_best_times(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.get("/api/sessions/best-times/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreaterEqual(data["sample_size"], 1)
        self.assertTrue(data["slots"])
        self.assertIn("weekday_label", data["slots"][0])

    def test_students_are_rejected(self):
        self.client.force_authenticate(self.students[0])

        self.assertEqual(
            self.client.get("/api/sessions/enrollment-forecast/").status_code, 403
        )
        self.assertEqual(
            self.client.get("/api/sessions/best-times/").status_code, 403
        )


def _past_datetime(weekday, hour, now):
    local_now = timezone.localtime(now)
    days_back = (local_now.weekday() - weekday) % 7
    day = local_now.date() - timedelta(days=days_back + 7)
    return timezone.make_aware(datetime.combine(day, time(hour, 0)))
