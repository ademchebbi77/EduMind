from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.models import User
from courses.models import Course
from courses.tests.utils import TemporaryMediaMixin, create_course

USERS_URL = "/api/auth/users/"
CSRF_URL = "/api/auth/csrf/"
PASSWORD = "StrongPass123!"


class AdminUserApiTests(TemporaryMediaMixin, APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin@example.com",
            password=PASSWORD,
            first_name="Ada",
            last_name="Admin",
            role=User.Role.ADMIN,
        )
        self.teacher = User.objects.create_user(
            email="teacher@example.com",
            password=PASSWORD,
            first_name="Thomas",
            last_name="Martin",
            role=User.Role.TEACHER,
        )
        self.student = User.objects.create_user(
            email="student@example.com",
            password=PASSWORD,
            first_name="Sofia",
            last_name="Durand",
            role=User.Role.STUDENT,
        )

    def user_url(self, user):
        return f"{USERS_URL}{user.pk}/"

    def test_list_requires_authentication(self):
        response = self.client.get(USERS_URL)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(
            response.json()["error"]["code"],
            "authentication_required",
        )

    def test_non_admin_cannot_manage_users(self):
        for user in (self.teacher, self.student):
            self.client.force_authenticate(user)

            listed = self.client.get(USERS_URL)
            updated = self.client.patch(
                self.user_url(self.student),
                {"first_name": "Intruse"},
                format="json",
            )
            deleted = self.client.delete(self.user_url(self.admin))

            self.assertEqual(listed.status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(updated.status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(deleted.status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(
                listed.json()["error"]["code"],
                "permission_denied",
            )
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())

    def test_admin_can_list_every_account(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(USERS_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(body["count"], 3)
        self.assertEqual(len(body["results"]), 3)
        payload = body["results"][0]
        self.assertIn("full_name", payload)
        self.assertIn("role_display", payload)
        self.assertIn("is_active", payload)
        self.assertIn("is_superuser", payload)
        self.assertIn("date_joined", payload)

    def test_admin_can_search_and_filter_accounts(self):
        self.client.force_authenticate(self.admin)

        search = self.client.get(USERS_URL, {"search": "sofia"})
        role = self.client.get(USERS_URL, {"role": User.Role.TEACHER})
        active = self.client.get(USERS_URL, {"is_active": "true"})

        self.assertEqual(search.json()["count"], 1)
        self.assertEqual(search.json()["results"][0]["email"], self.student.email)
        self.assertEqual(role.json()["count"], 1)
        self.assertEqual(role.json()["results"][0]["email"], self.teacher.email)
        self.assertEqual(active.json()["count"], 3)

    def test_admin_can_filter_inactive_accounts(self):
        self.student.is_active = False
        self.student.save(update_fields=["is_active"])
        self.client.force_authenticate(self.admin)

        response = self.client.get(USERS_URL, {"is_active": "false"})

        self.assertEqual(response.json()["count"], 1)
        self.assertEqual(response.json()["results"][0]["email"], self.student.email)

    def test_list_rejects_invalid_filters(self):
        self.client.force_authenticate(self.admin)

        invalid_role = self.client.get(USERS_URL, {"role": "owner"})
        invalid_active = self.client.get(USERS_URL, {"is_active": "maybe"})

        self.assertEqual(invalid_role.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("role", invalid_role.json()["error"]["fields"])
        self.assertEqual(invalid_active.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("is_active", invalid_active.json()["error"]["fields"])

    def test_admin_can_retrieve_an_account(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.user_url(self.teacher))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["email"], self.teacher.email)
        self.assertEqual(response.json()["full_name"], "Thomas Martin")

    def test_detail_returns_json_404_for_unknown_account(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(f"{USERS_URL}999999/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.json()["error"]["code"], "not_found")

    def test_admin_can_update_name_email_and_normalizes_email(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.user_url(self.student),
            {
                "first_name": "  Sofia-Marie ",
                "last_name": "Leroy",
                "email": "  Sofia.Leroy@Example.COM ",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(body["first_name"], "Sofia-Marie")
        self.assertEqual(body["last_name"], "Leroy")
        self.assertEqual(body["full_name"], "Sofia-Marie Leroy")
        self.assertEqual(body["email"], "sofia.leroy@example.com")

        self.student.refresh_from_db()
        self.assertEqual(self.student.email, "sofia.leroy@example.com")
        self.assertEqual(self.student.username, "sofia.leroy@example.com")

    def test_admin_can_change_role_and_desactivate_an_account(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.user_url(self.student),
            {"role": User.Role.TEACHER, "is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["role"], User.Role.TEACHER)
        self.assertEqual(response.json()["role_display"], "Teacher")
        self.assertFalse(response.json()["is_active"])

        self.student.refresh_from_db()
        self.assertEqual(self.student.role, User.Role.TEACHER)
        self.assertFalse(self.student.is_active)

    def test_admin_can_reactivate_an_account(self):
        self.student.is_active = False
        self.student.save(update_fields=["is_active"])
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.user_url(self.student),
            {"is_active": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.json()["is_active"])

    def test_admin_can_update_their_own_name_and_email(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.user_url(self.admin),
            {
                "first_name": "Adeline",
                "email": "adeline@example.com",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["first_name"], "Adeline")
        self.assertEqual(response.json()["email"], "adeline@example.com")

    def test_admin_cannot_change_their_own_role(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.user_url(self.admin),
            {"role": User.Role.TEACHER},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("role", response.json()["error"]["fields"])
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, User.Role.ADMIN)

    def test_admin_cannot_desactivate_their_own_account(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.user_url(self.admin),
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("is_active", response.json()["error"]["fields"])
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_last_active_admin_cannot_be_demoted_or_desactivated(self):
        inactive_admin = User.objects.create_user(
            email="inactive-admin@example.com",
            password=PASSWORD,
            first_name="Inactive",
            last_name="Admin",
            role=User.Role.ADMIN,
            is_active=False,
        )
        self.client.force_authenticate(inactive_admin)

        demoted = self.client.patch(
            self.user_url(self.admin),
            {"role": User.Role.TEACHER},
            format="json",
        )
        desactivated = self.client.patch(
            self.user_url(self.admin),
            {"is_active": False},
            format="json",
        )

        self.assertEqual(demoted.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("role", demoted.json()["error"]["fields"])
        self.assertEqual(desactivated.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("is_active", desactivated.json()["error"]["fields"])
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, User.Role.ADMIN)
        self.assertTrue(self.admin.is_active)

    def test_active_admin_can_be_demoted_when_another_admin_remains(self):
        other_admin = User.objects.create_user(
            email="second-admin@example.com",
            password=PASSWORD,
            first_name="Second",
            last_name="Admin",
            role=User.Role.ADMIN,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.user_url(other_admin),
            {"role": User.Role.TEACHER},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["role"], User.Role.TEACHER)

    def test_superuser_role_cannot_be_changed(self):
        superuser = User.objects.create_superuser(
            email="superuser@example.com",
            password=PASSWORD,
            first_name="Super",
            last_name="User",
        )
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.user_url(superuser),
            {"role": User.Role.TEACHER},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("role", response.json()["error"]["fields"])
        superuser.refresh_from_db()
        self.assertEqual(superuser.role, User.Role.ADMIN)

    def test_update_rejects_duplicate_email_case_insensitively(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.user_url(self.student),
            {"email": "TEACHER@EXAMPLE.COM"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.json()["error"]["fields"])

    def test_update_rejects_blank_names_and_invalid_values(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            self.user_url(self.student),
            {
                "first_name": "",
                "last_name": "",
                "email": "not-an-email",
                "role": "owner",
                "is_active": "maybe",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        fields = response.json()["error"]["fields"]
        for field in ("first_name", "last_name", "email", "role", "is_active"):
            self.assertIn(field, fields)

    def test_update_and_delete_require_csrf_when_enforced(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_authenticate(self.admin)

        blocked = client.patch(
            self.user_url(self.student),
            {"first_name": "Sofia"},
            format="json",
        )
        blocked_delete = client.delete(self.user_url(self.teacher))
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(blocked.json()["error"]["code"], "csrf_failed")
        self.assertEqual(blocked_delete.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(blocked_delete.json()["error"]["code"], "csrf_failed")

        csrf_response = client.get(CSRF_URL)
        token = csrf_response.cookies["csrftoken"].value
        allowed = client.patch(
            self.user_url(self.student),
            {"first_name": "Sofia"},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        allowed_delete = client.delete(
            self.user_url(self.teacher),
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
        self.assertEqual(allowed_delete.status_code, status.HTTP_204_NO_CONTENT)

    def test_admin_can_delete_an_account(self):
        self.client.force_authenticate(self.admin)

        response = self.client.delete(self.user_url(self.student))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=self.student.pk).exists())

    def test_deleting_an_account_removes_owned_courses_and_files(self):
        course = create_course(self.teacher, title="Cours supprimé")
        storage = course.file.storage
        file_name = course.file.name
        self.client.force_authenticate(self.admin)

        response = self.client.delete(self.user_url(self.teacher))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=self.teacher.pk).exists())
        self.assertFalse(Course.objects.filter(pk=course.pk).exists())
        self.assertFalse(storage.exists(file_name))

    def test_admin_cannot_delete_their_own_account(self):
        self.client.force_authenticate(self.admin)

        response = self.client.delete(self.user_url(self.admin))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(
            "You cannot delete your own account.",
            response.json()["error"]["fields"]["non_field_errors"],
        )
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())

    def test_last_active_admin_cannot_be_deleted(self):
        inactive_admin = User.objects.create_user(
            email="inactive-admin@example.com",
            password=PASSWORD,
            first_name="Inactive",
            last_name="Admin",
            role=User.Role.ADMIN,
            is_active=False,
        )
        self.client.force_authenticate(inactive_admin)

        response = self.client.delete(self.user_url(self.admin))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(
            "At least one active administrator must remain.",
            response.json()["error"]["fields"]["non_field_errors"],
        )
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())

    def test_active_admin_can_be_deleted_when_another_admin_remains(self):
        other_admin = User.objects.create_user(
            email="second-admin@example.com",
            password=PASSWORD,
            first_name="Second",
            last_name="Admin",
            role=User.Role.ADMIN,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.delete(self.user_url(other_admin))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=other_admin.pk).exists())

    def test_put_is_not_allowed_on_account_detail(self):
        self.client.force_authenticate(self.admin)

        response = self.client.put(
            self.user_url(self.student),
            {"first_name": "Sofia"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(
            response.json()["error"]["code"],
            "method_not_allowed",
        )
