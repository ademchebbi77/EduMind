from datetime import date

from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import User

from ..models import Announcement
from ..urgency import compute_urgency

TODAY = date(2026, 10, 25)


def make_user(email, role):
    return User.objects.create_user(
        email=email,
        password="StrongPass123!",
        first_name=email.split("@")[0].title(),
        last_name="Test",
        role=role,
    )


def make_announcement(author, **fields):
    fields.setdefault("title", "Annonce")
    fields.setdefault("content", "Contenu de l'annonce.")
    return Announcement.objects.create(author=author, **fields)


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class UrgencyScoreTests(APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)

    def test_imminent_event_scores_higher_than_distant_event(self):
        imminent = make_announcement(self.teacher, event_date=date(2026, 10, 27))
        distant = make_announcement(self.teacher, event_date=date(2026, 11, 20))

        self.assertGreater(
            compute_urgency(imminent, enrollment_count=0, today=TODAY).score,
            compute_urgency(distant, enrollment_count=0, today=TODAY).score,
        )

    def test_past_event_gets_no_temporal_bonus(self):
        past = make_announcement(self.teacher, event_date=date(2026, 10, 20))
        undated = make_announcement(self.teacher)

        self.assertEqual(
            compute_urgency(past, enrollment_count=0, today=TODAY).score,
            compute_urgency(undated, enrollment_count=0, today=TODAY).score,
        )

    def test_pinned_announcement_scores_higher(self):
        pinned = make_announcement(self.teacher, is_pinned=True)
        regular = make_announcement(self.teacher)

        urgency = compute_urgency(pinned, enrollment_count=0, today=TODAY)

        self.assertEqual(urgency.score - compute_urgency(regular, enrollment_count=0, today=TODAY).score, 25)
        self.assertIn("Épinglée par l'équipe pédagogique", urgency.reasons)

    def test_urgency_keywords_are_detected_without_accents(self):
        announcement = make_announcement(
            self.teacher,
            title="ANNULÉE : date limite demain",
            content="La session est reportée, merci de votre attention.",
        )

        urgency = compute_urgency(announcement, enrollment_count=0, today=TODAY)

        self.assertTrue(any(reason.startswith("Expressions repérées") for reason in urgency.reasons))
        self.assertGreaterEqual(urgency.score, 25)

    def test_engagement_bonus_is_capped(self):
        announcement = make_announcement(self.teacher)

        moderate = compute_urgency(announcement, enrollment_count=5, today=TODAY).score
        heavy = compute_urgency(announcement, enrollment_count=500, today=TODAY).score

        self.assertEqual(moderate, heavy)

    def test_score_is_clamped_and_levels_are_mapped(self):
        announcement = make_announcement(
            self.teacher,
            title="URGENT : dernier délai ce soir",
            content="Inscription obligatoire et places limitées.",
            event_date=date(2026, 10, 26),
            is_pinned=True,
        )

        urgency = compute_urgency(announcement, enrollment_count=40, today=TODAY)

        self.assertEqual(urgency.score, 100)
        self.assertEqual(urgency.level, "high")
        self.assertEqual(urgency.label, "Élevée")

    def test_low_score_is_labelled_low(self):
        announcement = make_announcement(self.teacher, title="Nouvelle rubrique", content="Bonne lecture.")

        urgency = compute_urgency(announcement, enrollment_count=0, today=TODAY)

        self.assertEqual(urgency.level, "low")
        self.assertEqual(urgency.label, "Faible")


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class UrgencySerializerTests(APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)
        self.student = make_user("student@example.com", User.Role.STUDENT)
        self.announcement = make_announcement(
            self.teacher,
            title="URGENT : début du cours",
            content="Dernier délai : inscription obligatoire.",
            event_date=date.today(),
        )

    def test_list_exposes_urgency_payload(self):
        self.client.force_login(self.student)
        response = self.client.get("/api/announcements/")

        self.assertEqual(response.status_code, 200)
        urgency = response.json()["results"][0]["urgency"]
        self.assertEqual(urgency["level"], "high")
        self.assertEqual(urgency["label"], "Élevée")
        self.assertTrue(1 <= urgency["score"] <= 100)
        self.assertTrue(urgency["reasons"])
