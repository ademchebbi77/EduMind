from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import User

from ..models import Announcement, AnnouncementEnrollment


def make_user(email, role=User.Role.STUDENT):
    return User.objects.create_user(
        email=email,
        password="StrongPass123!",
        first_name=email.split("@")[0].title(),
        last_name="Test",
        role=role,
    )


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class AnnouncementCapacityTests(APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)
        self.announcement = Announcement.objects.create(
            title="Formation Python",
            content="Formation limitée à deux places.",
            author=self.teacher,
            capacity=2,
        )
        self.students = [make_user(f"student{index}@example.com") for index in range(3)]
        for student in self.students[:2]:
            AnnouncementEnrollment.objects.create(
                announcement=self.announcement,
                student=student,
                full_name=student.get_full_name(),
                email=student.email,
            )

    def enroll(self, student):
        self.client.force_authenticate(student)
        return self.client.post(
            "/api/announcement-enrollments/",
            {
                "announcement": self.announcement.pk,
                "full_name": student.get_full_name(),
                "email": student.email,
            },
        )

    def test_enrollment_is_rejected_when_capacity_is_reached(self):
        response = self.enroll(self.students[2])

        self.assertEqual(response.status_code, 400)
        self.assertIn("Plus de places", str(response.data))
        self.assertEqual(
            AnnouncementEnrollment.objects.filter(announcement=self.announcement).count(), 2
        )

    def test_rejected_enrollment_frees_a_seat(self):
        AnnouncementEnrollment.objects.filter(
            announcement=self.announcement, student=self.students[0]
        ).update(status=AnnouncementEnrollment.Status.REJECTED)

        response = self.enroll(self.students[2])

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            AnnouncementEnrollment.objects.filter(announcement=self.announcement).count(), 3
        )

    def test_unlimited_announcement_accepts_enrollments(self):
        self.announcement.capacity = None
        self.announcement.save(update_fields=["capacity"])

        response = self.enroll(self.students[2])

        self.assertEqual(response.status_code, 201)

    def test_serializer_exposes_places_and_remaining_seats(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.get(f"/api/announcements/{self.announcement.pk}/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["capacity"], 2)
        self.assertEqual(payload["seats_taken"], 2)
        self.assertEqual(payload["seats_remaining"], 0)
        self.assertEqual(payload["enrollment_count"], 0)
