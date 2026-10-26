"""Extraction locale des champs d'une annonce (règles, TF-IDF et API)."""

from datetime import date, datetime, timedelta
from unittest import mock

from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from sessions.models import LiveSession

from ..extraction import (
    extract_announcement,
    extract_audience,
    extract_capacity,
    extract_date,
    extract_link,
    extract_time,
    fold,
)
from ..models import Announcement

TODAY = date(2026, 10, 26)  # un lundi
URL = "/api/announcements/extract/"

FULL_TEXT = """📢 Atelier Python pour la data science
Un atelier pratique réservé aux étudiants de 2e année aura lieu le jeudi 12 novembre 2026 de 14h30 à 17h en ligne.
Places limitées à 25 participants. Inscription avant le 5 novembre.
Lien : https://meet.google.com/abc-defg-hij.
Python 3.12 sera utilisé."""


def make_user(email, role=User.Role.STUDENT):
    return User.objects.create_user(
        email=email,
        password="StrongPass123!",
        first_name=email.split("@")[0].title(),
        last_name="Test",
        role=role,
    )


def make_session(author, title, description="", starts_at=None, **extra):
    starts_at = starts_at or timezone.make_aware(datetime(2026, 11, 12, 14, 30))
    return LiveSession.objects.create(
        title=title,
        description=description,
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=2),
        created_by=author,
        **extra,
    )


def extract(text, **kwargs):
    return extract_announcement(text, today=TODAY, **kwargs)


def field(text, name, method):
    folded = fold(text)
    if name == "date":
        return method(text, folded, TODAY)
    if name == "link":
        return method(text)
    return method(text, folded)


class FoldTests(SimpleTestCase):
    def test_keeps_length_and_removes_accents(self):
        text = "Réservé aux élèves – l’atelier"
        self.assertEqual(fold(text), "reserve aux eleves – l'atelier")
        self.assertEqual(len(fold(text)), len(text))


class FullTextTests(SimpleTestCase):
    def test_every_field_of_a_complete_announcement(self):
        fields = extract(FULL_TEXT)

        self.assertEqual(fields["title"]["value"], "Atelier Python pour la data science")
        self.assertTrue(fields["content"]["value"].startswith("Un atelier pratique"))
        self.assertNotIn("📢", fields["content"]["value"])
        self.assertEqual(fields["target_audience"]["value"], "students")
        self.assertEqual(fields["target_audience"]["label"], "Étudiants seulement")
        self.assertEqual(fields["category"]["value"], "formation")
        self.assertEqual(fields["event_date"]["value"], "2026-11-12")
        self.assertEqual(fields["event_time"]["value"], "14:30")
        self.assertEqual(fields["meeting_link"]["value"], "https://meet.google.com/abc-defg-hij")
        self.assertEqual(fields["capacity"]["value"], 25)
        self.assertFalse(fields["related_session"]["detected"])

        for name, data in fields.items():
            self.assertEqual(set(data) >= {"value", "label", "confidence", "detected", "source"}, True, name)
            self.assertTrue(0 <= data["confidence"] <= 100)

    def test_is_deterministic(self):
        self.assertEqual(extract(FULL_TEXT), extract(FULL_TEXT))

    def test_text_without_information(self):
        fields = extract("Bonjour à toutes et à tous, bonne semaine !")
        for name in ("target_audience", "category", "event_date", "event_time", "meeting_link", "capacity"):
            self.assertFalse(fields[name]["detected"], name)
            self.assertEqual(fields[name]["source"], "Non détecté")
        self.assertTrue(fields["title"]["detected"])


class TitleAndContentTests(SimpleTestCase):
    def test_labelled_title(self):
        fields = extract("Objet : Réunion pédagogique\nTous les enseignants sont attendus en salle B12.")
        self.assertEqual(fields["title"]["value"], "Réunion pédagogique")
        self.assertEqual(fields["title"]["confidence"], 95)
        self.assertEqual(fields["content"]["value"], "Tous les enseignants sont attendus en salle B12.")

    def test_single_paragraph_uses_first_sentence(self):
        text = "Le partiel de mathématiques est reporté. Il aura lieu la semaine suivante en amphi A."
        fields = extract(text)
        self.assertEqual(fields["title"]["value"], "Le partiel de mathématiques est reporté")
        self.assertEqual(fields["title"]["confidence"], 55)
        self.assertEqual(fields["content"]["value"], text)

    def test_long_first_sentence_is_shortened(self):
        text = "Nous " + "avons le plaisir de vous annoncer " * 6 + "une conférence."
        self.assertLessEqual(len(extract(text)["title"]["value"]), 101)


class AudienceTests(SimpleTestCase):
    def audience(self, text):
        return field(text, "audience", extract_audience)

    def test_explicit_groups(self):
        self.assertEqual(self.audience("Formation destinée aux enseignants du département.").value, "teachers")
        self.assertEqual(self.audience("Atelier réservé aux étudiants de master.").value, "students")
        self.assertEqual(self.audience("Conférence ouverte à tous.").value, "all")
        self.assertEqual(self.audience("Conférence ouverte à tous.").confidence, 90)

    def test_both_groups(self):
        result = self.audience("Les étudiants et les enseignants sont invités à la cérémonie.")
        self.assertEqual(result.value, "all")
        self.assertEqual(result.confidence, 60)

    def test_simple_mention_has_lower_confidence(self):
        result = self.audience("Les professeurs doivent saisir les résultats.")
        self.assertEqual(result.value, "teachers")
        self.assertEqual(result.confidence, 65)

    def test_nothing_found(self):
        self.assertEqual(self.audience("Fermeture de la bibliothèque lundi.").confidence, 0)


class CategoryTests(SimpleTestCase):
    def test_reuses_existing_categorization(self):
        fields = extract("Rattrapage de l'examen d'algèbre\nLe rattrapage aura lieu en salle 4.")
        self.assertEqual(fields["category"]["value"], "evaluation")
        self.assertEqual(fields["category"]["label"], "Évaluation")
        self.assertIn("rattrapage", fields["category"]["source"])


class DateTests(SimpleTestCase):
    def date_of(self, text):
        return field(text, "date", extract_date)

    def test_textual_dates(self):
        self.assertEqual(self.date_of("le 3 mars 2027").value, "2027-03-03")
        self.assertEqual(self.date_of("le 1er décembre").value, "2026-12-01")
        self.assertEqual(self.date_of("lundi 9 novembre").value, "2026-11-09")
        # Sans année et déjà passée cette année : l'année suivante.
        self.assertEqual(self.date_of("le 15 janvier").value, "2027-01-15")

    def test_numeric_dates(self):
        self.assertEqual(self.date_of("le 12/11/2026").value, "2026-11-12")
        self.assertEqual(self.date_of("le 12/11").value, "2026-11-12")
        self.assertEqual(self.date_of("le 12.11.26").value, "2026-11-12")
        self.assertEqual(self.date_of("le 2026-11-12").value, "2026-11-12")

    def test_relative_dates(self):
        self.assertEqual(self.date_of("Réunion demain").value, "2026-10-27")
        self.assertEqual(self.date_of("Réunion après-demain").value, "2026-10-28")
        self.assertEqual(self.date_of("aujourd’hui à 18h").value, "2026-10-26")
        self.assertEqual(self.date_of("ce vendredi").value, "2026-10-30")
        self.assertEqual(self.date_of("lundi prochain").value, "2026-11-02")

    def test_invalid_or_ambiguous_numbers_are_not_dates(self):
        self.assertEqual(self.date_of("le 31/02/2026").confidence, 0)
        self.assertEqual(self.date_of("Nous utiliserons Python 3.12").confidence, 0)

    def test_deadline_is_not_the_event_date(self):
        result = self.date_of("Inscription avant le 5 novembre. La journée aura lieu le 20 novembre.")
        self.assertEqual(result.value, "2026-11-20")

    def test_only_a_deadline_lowers_the_confidence(self):
        result = self.date_of("Déposez votre dossier avant le 5 novembre 2026.")
        self.assertEqual(result.value, "2026-11-05")
        self.assertEqual(result.confidence, 70)
        self.assertIn("date limite", result.source)

    def test_past_date_is_flagged(self):
        result = self.date_of("le 3 mars 2025")
        self.assertEqual(result.confidence, 75)
        self.assertIn("date passée", result.source)


class TimeTests(SimpleTestCase):
    def time_of(self, text):
        return field(text, "time", extract_time)

    def test_formats(self):
        self.assertEqual(self.time_of("à 9h").value, "09:00")
        self.assertEqual(self.time_of("à 9h").confidence, 90)
        self.assertEqual(self.time_of("vers 14 h 15").value, "14:15")
        self.assertEqual(self.time_of("rendez-vous 18:45").value, "18:45")
        self.assertEqual(self.time_of("à 10 heures").value, "10:00")
        self.assertEqual(self.time_of("on se retrouve à midi").value, "12:00")

    def test_range_keeps_the_start(self):
        self.assertEqual(self.time_of("de 14h à 16h").value, "14:00")

    def test_durations_and_invalid_hours_are_ignored(self):
        self.assertEqual(self.time_of("une formation pendant 3h").confidence, 0)
        self.assertEqual(self.time_of("support 24h/24").confidence, 0)
        self.assertEqual(self.time_of("à 25h").confidence, 0)


class LinkTests(SimpleTestCase):
    def link_of(self, text):
        return field(text, "link", extract_link)

    def test_meeting_link_is_preferred(self):
        result = self.link_of("Programme : https://example.com/programme. Salle : https://zoom.us/j/123456789.")
        self.assertEqual(result.value, "https://zoom.us/j/123456789")
        self.assertEqual(result.confidence, 95)

    def test_other_links(self):
        self.assertEqual(self.link_of("Voir https://edumind.tn/agenda").confidence, 70)
        result = self.link_of("Infos sur www.edumind.tn/agenda.")
        self.assertEqual(result.value, "https://www.edumind.tn/agenda")
        self.assertEqual(result.confidence, 55)

    def test_no_link(self):
        self.assertEqual(self.link_of("Aucun lien ici, http:// seul").confidence, 0)

    def test_link_digits_are_not_dates_or_times(self):
        fields = extract("Rejoignez https://zoom.us/j/12/11/2026?pwd=14h30 pour la réunion.")
        self.assertFalse(fields["event_date"]["detected"])
        self.assertFalse(fields["event_time"]["detected"])


class CapacityTests(SimpleTestCase):
    def capacity_of(self, text):
        return field(text, "capacity", extract_capacity)

    def test_formats(self):
        self.assertEqual(self.capacity_of("30 places disponibles").value, 30)
        self.assertEqual(self.capacity_of("Atelier limité à 12 personnes").value, 12)
        self.assertEqual(self.capacity_of("Capacité : 40").value, 40)
        self.assertEqual(self.capacity_of("maximum 15 participants").value, 15)
        self.assertEqual(self.capacity_of("20 inscrits maximum").value, 20)
        self.assertEqual(self.capacity_of("Il reste vingt places").value, 20)

    def test_unlimited(self):
        result = self.capacity_of("Entrée libre, places illimitées.")
        self.assertIsNone(result.value)
        self.assertEqual(result.label, "Illimité")
        self.assertEqual(result.confidence, 80)

    def test_nothing_found(self):
        self.assertEqual(self.capacity_of("Réservez votre place.").confidence, 0)


class SessionMatchingTests(TestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)
        self.python = make_session(
            self.teacher,
            "Atelier Python pour la data science",
            "Pandas, NumPy et visualisation des données.",
            session_type=LiveSession.SessionType.TRAINING,
        )
        self.law = make_session(self.teacher, "Droit des contrats", "Introduction au droit civil.")

    def test_best_session_by_tfidf(self):
        fields = extract(FULL_TEXT, sessions=LiveSession.objects.all())
        session = fields["related_session"]
        self.assertTrue(session["detected"])
        self.assertEqual(session["value"], self.python.pk)
        self.assertEqual(session["label"], "Atelier Python pour la data science")
        self.assertEqual(session["session_type"], "training")
        self.assertIn("TF-IDF", session["source"])
        self.assertGreaterEqual(session["confidence"], 50)

    def test_unrelated_text_has_no_session(self):
        fields = extract("Fermeture exceptionnelle de la cafétéria vendredi.", sessions=LiveSession.objects.all())
        self.assertFalse(fields["related_session"]["detected"])

    def test_same_day_breaks_ties(self):
        other_day = make_session(
            self.teacher,
            "Atelier Python avancé",
            "Pandas et NumPy.",
            starts_at=timezone.make_aware(datetime(2026, 12, 1, 9, 0)),
        )
        text = "Atelier Python le 1er décembre 2026 à 9h."
        fields = extract(text, sessions=[self.python, other_day])
        self.assertEqual(fields["related_session"]["value"], other_day.pk)


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class ExtractionApiTests(APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)
        self.admin = make_user("admin@example.com", User.Role.ADMIN)
        self.student = make_user("student@example.com")

    def test_requires_authentication(self):
        self.assertEqual(self.client.post(URL, {"text": FULL_TEXT}, format="json").status_code, 401)

    def test_students_cannot_use_it(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.post(URL, {"text": FULL_TEXT}, format="json").status_code, 403)

    def test_teacher_and_admin_get_the_fields(self):
        for user in (self.teacher, self.admin):
            self.client.force_authenticate(user)
            response = self.client.post(URL, {"text": FULL_TEXT}, format="json")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["fields"]["meeting_link"]["value"], "https://meet.google.com/abc-defg-hij")
            self.assertEqual(response.data["detected_count"], 8)

    def test_nothing_is_saved(self):
        self.client.force_authenticate(self.teacher)
        self.client.post(URL, {"text": FULL_TEXT}, format="json")
        self.assertFalse(Announcement.objects.exists())

    def test_matches_only_upcoming_sessions(self):
        session = make_session(self.teacher, "Atelier Python pour la data science", "Pandas et NumPy.")
        make_session(
            self.teacher,
            "Atelier Python pour la data science (ancienne)",
            "Pandas et NumPy.",
            status=LiveSession.Status.CANCELLED,
        )
        self.client.force_authenticate(self.teacher)
        response = self.client.post(URL, {"text": FULL_TEXT}, format="json")
        self.assertEqual(response.data["fields"]["related_session"]["value"], session.pk)

    def test_validation(self):
        self.client.force_authenticate(self.teacher)
        for payload, message in (
            ({}, "Saisissez le texte à analyser."),
            ({"text": "   "}, "Saisissez le texte à analyser."),
            ({"text": "Trop court"}, "trop court"),
            ({"text": "x" * 5001}, "5000"),
        ):
            response = self.client.post(URL, payload, format="json")
            self.assertEqual(response.status_code, 400)
            self.assertIn(message, str(response.data["error"]["fields"]["text"]))

    def test_get_is_not_allowed(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.get(URL).status_code, 405)

    def test_no_network_call(self):
        self.client.force_authenticate(self.teacher)
        with mock.patch("socket.socket.connect", side_effect=AssertionError("network call")):
            response = self.client.post(URL, {"text": FULL_TEXT}, format="json")
        self.assertEqual(response.status_code, 200)
