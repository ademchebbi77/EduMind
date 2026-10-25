from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import User

from ..categorization import categorize
from ..models import Announcement


def make_user(email, role=User.Role.STUDENT):
    return User.objects.create_user(
        email=email,
        password="StrongPass123!",
        first_name=email.split("@")[0].title(),
        last_name="Test",
        role=role,
    )


def make_announcement(author, title, content=""):
    return Announcement.objects.create(title=title, content=content, author=author)


class CategorizationRuleTests(APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)

    def test_formation_announcement_is_detected(self):
        announcement = make_announcement(
            self.teacher,
            "Nouvelle formation Python",
            "Un atelier de trois jours pour progresser.",
        )

        category = categorize(announcement)

        self.assertEqual(category.key, "formation")
        self.assertEqual(category.label, "Formation")
        self.assertGreater(category.confidence, 0)
        self.assertIn("formation", category.matched_keywords)

    def test_title_weighs_more_than_content(self):
        announcement = make_announcement(
            self.teacher,
            "Examen final",
            "La formation se termine par une évaluation écrite.",
        )

        self.assertEqual(categorize(announcement).key, "evaluation")

    def test_manual_category_takes_precedence(self):
        announcement = make_announcement(
            self.teacher,
            "Examen final",
            "La formation se termine par une évaluation écrite.",
        )
        announcement.category_override = "administratif"

        category = categorize(announcement)

        self.assertEqual(category.key, "administratif")
        self.assertEqual(category.confidence, 100)
        self.assertEqual(category.matched_keywords, ())

    def test_unknown_text_falls_back_to_autre(self):
        announcement = make_announcement(self.teacher, "Bonne écoute", "À bientôt !")

        category = categorize(announcement)

        self.assertEqual(category.key, "autre")
        self.assertEqual(category.confidence, 0)
        self.assertEqual(category.matched_keywords, ())


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class CategoryApiTests(APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)
        self.student = make_user("student@example.com")
        make_announcement(
            self.teacher,
            "Examen de mi-parcours",
            "Les résultats seront publiés vendredi.",
        )
        make_announcement(
            self.teacher,
            "Formation Deep Learning",
            "Un atelier pratique sur les réseaux de neurones.",
        )
        self.client.force_authenticate(self.student)

    def test_serializer_exposes_category(self):
        response = self.client.get("/api/announcements/")

        self.assertEqual(response.status_code, 200)
        keys = {item["category"]["key"] for item in response.json()["results"]}
        self.assertEqual(keys, {"evaluation", "formation"})

    def test_category_filter_keeps_matching_announcements(self):
        response = self.client.get("/api/announcements/", {"category": "formation"})

        self.assertEqual(response.status_code, 200)
        results = response.json()["results"]
        self.assertEqual([item["title"] for item in results], ["Formation Deep Learning"])

    def test_unknown_category_is_rejected(self):
        response = self.client.get("/api/announcements/", {"category": "inconnue"})

        self.assertEqual(response.status_code, 400)

    def test_manual_category_is_stored_and_used_by_filter(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.post(
            "/api/announcements/",
            {
                "title": "Examen final",
                "content": "La formation se termine par une évaluation écrite.",
                "target_audience": "all",
                "category_override": "administratif",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["category"]["key"], "administratif")
        self.assertTrue(response.json()["category"]["manual"])

        self.client.force_authenticate(self.student)
        listing = self.client.get("/api/announcements/", {"category": "administratif"})
        titles = [item["title"] for item in listing.json()["results"]]
        self.assertEqual(titles, ["Examen final"])

    def test_unknown_manual_category_is_rejected(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.post(
            "/api/announcements/",
            {
                "title": "Annonce invalide",
                "content": "Contenu",
                "category_override": "inconnue",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_categories_endpoint_lists_labels(self):
        response = self.client.get("/api/announcements/categories/")

        self.assertEqual(response.status_code, 200)
        keys = {item["key"] for item in response.json()}
        self.assertIn("formation", keys)
        self.assertIn("autre", keys)
