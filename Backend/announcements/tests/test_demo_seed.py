from django.test import TestCase

from accounts.models import User
from announcements.models import Announcement, AnnouncementEnrollment

from ..demo import DEMO_ANNOUNCEMENTS, seed_announcements


class SeedAnnouncementsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User.objects.create_user(
            "teacher@edumind.local",
            "secret",
            first_name="Thomas",
            last_name="Enseignant",
            role=User.Role.TEACHER,
        )

    def test_seed_is_idempotent(self):
        total, created, _, _ = seed_announcements()
        self.assertEqual(total, len(DEMO_ANNOUNCEMENTS))
        self.assertEqual(created, len(DEMO_ANNOUNCEMENTS))

        total, created, _, _ = seed_announcements()
        self.assertEqual(total, len(DEMO_ANNOUNCEMENTS))
        self.assertEqual(created, 0)
        self.assertEqual(
            Announcement.objects.filter(
                title__in=[spec["title"] for spec in DEMO_ANNOUNCEMENTS]
            ).count(),
            len(DEMO_ANNOUNCEMENTS),
        )

    def test_seed_covers_all_urgency_levels(self):
        _, _, _, scored = seed_announcements()

        self.assertEqual({urgency.level for _, urgency in scored}, {"low", "medium", "high"})
        self.assertGreaterEqual(scored[0][1].score, 90)
        self.assertEqual(scored[-1][1].score, 0)

    def test_confirmed_enrollments_only_are_counted_in_scores(self):
        seed_announcements()
        announcement = Announcement.objects.get(
            title="Dernier délai : dépôt des candidatures vendredi"
        )

        self.assertEqual(
            announcement.enrollments.filter(
                status=AnnouncementEnrollment.Status.CONFIRMED
            ).count(),
            3,
        )
        self.assertEqual(
            announcement.enrollments.filter(
                status=AnnouncementEnrollment.Status.PENDING
            ).count(),
            1,
        )
