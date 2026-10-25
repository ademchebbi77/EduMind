from django.contrib.auth.models import Group
from django.db import IntegrityError, transaction
from django.test import TestCase

from accounts.models import User


class UserModelTests(TestCase):
    password = "StrongPass123!"

    def test_default_role_is_student(self):
        user = User.objects.create_user(
            email="etudiant@example.com",
            password=self.password,
        )

        self.assertEqual(user.role, User.Role.STUDENT)
        self.assertEqual(user.username, "etudiant@example.com")

    def test_email_is_normalized_to_lowercase(self):
        user = User.objects.create_user(
            email="  Alice@Example.COM ",
            password=self.password,
        )

        self.assertEqual(user.email, "alice@example.com")
        self.assertEqual(user.username, "alice@example.com")

    def test_email_is_unique_case_insensitively(self):
        User.objects.create_user(
            email="alice@example.com",
            password=self.password,
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create_user(
                email="ALICE@EXAMPLE.COM",
                password=self.password,
            )

    def test_create_user_requires_email(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(email="", password=self.password)

    def test_password_is_hashed(self):
        user = User.objects.create_user(
            email="hash@example.com",
            password=self.password,
        )

        self.assertNotEqual(user.password, self.password)
        self.assertTrue(user.check_password(self.password))

    def test_promoting_a_user_normalizes_email_and_username(self):
        user = User.objects.create_user(
            email="teacher@example.com",
            password=self.password,
        )

        user.email = "  NewTeacher@Example.COM "
        user.role = User.Role.TEACHER
        user.save()
        user.refresh_from_db()

        self.assertEqual(user.email, "newteacher@example.com")
        self.assertEqual(user.username, "newteacher@example.com")

    def test_create_superuser_gets_admin_role_and_flags(self):
        user = User.objects.create_superuser(
            email="admin@example.com",
            password=self.password,
            first_name="Ada",
            last_name="Admin",
        )

        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertEqual(user.role, User.Role.ADMIN)
        self.assertTrue(user.groups.filter(name=User.Role.ADMIN).exists())

    def test_role_group_is_synced_when_role_changes(self):
        user = User.objects.create_user(
            email="sync@example.com",
            password=self.password,
        )
        self.assertEqual(
            list(user.groups.values_list("name", flat=True)),
            [User.Role.STUDENT],
        )

        user.role = User.Role.TEACHER
        user.save()

        self.assertEqual(
            list(user.groups.values_list("name", flat=True)),
            [User.Role.TEACHER],
        )

    def test_role_groups_are_created_by_migration(self):
        self.assertTrue(Group.objects.filter(name="student").exists())
        self.assertTrue(Group.objects.filter(name="teacher").exists())
        self.assertTrue(Group.objects.filter(name="admin").exists())

    def test_full_name_and_fallback(self):
        user = User.objects.create_user(
            email="named@example.com",
            password=self.password,
            first_name="Camille",
            last_name="Martin",
        )
        self.assertEqual(user.full_name, "Camille Martin")

        anonymous = User.objects.create_user(
            email="unnamed@example.com",
            password=self.password,
        )
        self.assertEqual(anonymous.full_name, "unnamed@example.com")
        self.assertEqual(str(anonymous), "unnamed@example.com")
