import base64
import shutil
import tempfile
from pathlib import Path

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.models import User

REGISTER_URL = "/api/auth/register/"
LOGIN_URL = "/api/auth/login/"
LOGOUT_URL = "/api/auth/logout/"
ME_URL = "/api/auth/me/"
AVATAR_URL = "/api/auth/me/avatar/"
PASSWORD_URL = "/api/auth/me/password/"
CSRF_URL = "/api/auth/csrf/"

PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
JPEG_1PX = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00" + b"\x00" * 64


class AuthApiTests(APITestCase):
    password = "StrongPass123!"

    def setUp(self):
        cache.clear()

    def build_register_payload(self, **overrides):
        payload = {
            "first_name": "Alice",
            "last_name": "Martin",
            "email": "alice@example.com",
            "password": self.password,
            "password_confirm": self.password,
            "role": "teacher",
        }
        payload.update(overrides)
        return payload

    def create_user(self, **overrides):
        data = {
            "email": "user@example.com",
            "password": self.password,
            "first_name": "Jean",
            "last_name": "Dupont",
        }
        data.update(overrides)
        return User.objects.create_user(**data)

    def test_csrf_endpoint_sets_cookie(self):
        response = self.client.get(CSRF_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("csrftoken", response.cookies)
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_login_and_register_require_csrf_when_enforced(self):
        self.create_user()
        client = APIClient(enforce_csrf_checks=True)

        blocked = client.post(
            LOGIN_URL,
            {"email": "user@example.com", "password": self.password},
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(blocked.json()["error"]["code"], "csrf_failed")

        csrf_response = client.get(CSRF_URL)
        token = csrf_response.cookies["csrftoken"].value
        allowed = client.post(
            LOGIN_URL,
            {"email": "user@example.com", "password": self.password},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)

    def test_register_creates_user_and_logs_in(self):
        response = self.client.post(
            REGISTER_URL,
            self.build_register_payload(email="  Alice@Example.COM "),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        body = response.json()
        self.assertEqual(body["email"], "alice@example.com")
        self.assertEqual(body["role"], "teacher")
        self.assertEqual(body["full_name"], "Alice Martin")

        user = User.objects.get(email="alice@example.com")
        self.assertTrue(user.check_password(self.password))
        self.assertNotEqual(user.password, self.password)

        me = self.client.get(ME_URL)
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(me.json()["email"], "alice@example.com")

    def test_register_as_student_is_allowed(self):
        response = self.client.post(
            REGISTER_URL,
            self.build_register_payload(role="student"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["role"], "student")

    def test_self_registration_as_admin_is_rejected(self):
        response = self.client.post(
            REGISTER_URL,
            self.build_register_payload(role="admin"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("role", response.json()["error"]["fields"])
        self.assertFalse(User.objects.exists())

    def test_register_rejects_duplicate_email_case_insensitively(self):
        self.create_user(email="alice@example.com")

        response = self.client.post(
            REGISTER_URL,
            self.build_register_payload(email="ALICE@EXAMPLE.COM"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.json()["error"]["fields"])

    def test_register_rejects_mismatched_passwords(self):
        response = self.client.post(
            REGISTER_URL,
            self.build_register_payload(password_confirm="AnotherPass123!"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password_confirm", response.json()["error"]["fields"])

    def test_register_rejects_weak_password(self):
        response = self.client.post(
            REGISTER_URL,
            self.build_register_payload(
                password="12345678",
                password_confirm="12345678",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.json()["error"]["fields"])
        self.assertFalse(User.objects.exists())

    def test_register_rejects_missing_names(self):
        response = self.client.post(
            REGISTER_URL,
            self.build_register_payload(first_name="", last_name=""),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        fields = response.json()["error"]["fields"]
        self.assertIn("first_name", fields)
        self.assertIn("last_name", fields)

    def test_me_requires_authentication(self):
        response = self.client.get(ME_URL)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(
            response.json()["error"]["code"],
            "authentication_required",
        )

    def test_patch_me_requires_authentication(self):
        response = self.client.patch(ME_URL, {"first_name": "Nina"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_patch_me_updates_profile_and_normalizes_email(self):
        user = self.create_user(email="profile@example.com")
        self.client.force_authenticate(user)

        response = self.client.patch(
            ME_URL,
            {
                "first_name": "  Camille ",
                "last_name": "Durand",
                "email": "  Camille@Example.COM ",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(body["first_name"], "Camille")
        self.assertEqual(body["last_name"], "Durand")
        self.assertEqual(body["email"], "camille@example.com")
        self.assertEqual(body["full_name"], "Camille Durand")
        self.assertEqual(body["role"], User.Role.STUDENT)

        user.refresh_from_db()
        self.assertEqual(user.email, "camille@example.com")
        self.assertEqual(user.username, "camille@example.com")

    def test_patch_me_allows_keeping_the_same_email(self):
        user = self.create_user(email="same@example.com")
        self.client.force_authenticate(user)

        response = self.client.patch(
            ME_URL,
            {"email": "SAME@EXAMPLE.COM"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["email"], "same@example.com")

    def test_patch_me_rejects_duplicate_email_case_insensitively(self):
        user = self.create_user(email="first@example.com")
        self.create_user(email="second@example.com")
        self.client.force_authenticate(user)

        response = self.client.patch(
            ME_URL,
            {"email": "SECOND@EXAMPLE.COM"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.json()["error"]["fields"])
        user.refresh_from_db()
        self.assertEqual(user.email, "first@example.com")

    def test_patch_me_rejects_blank_names_and_invalid_email(self):
        user = self.create_user(email="invalid@example.com")
        self.client.force_authenticate(user)

        response = self.client.patch(
            ME_URL,
            {"first_name": " ", "last_name": "", "email": "not-an-email"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        fields = response.json()["error"]["fields"]
        self.assertIn("first_name", fields)
        self.assertIn("last_name", fields)
        self.assertIn("email", fields)

    def test_patch_me_cannot_change_role(self):
        user = self.create_user(email="role@example.com")
        self.client.force_authenticate(user)

        response = self.client.patch(ME_URL, {"role": "admin"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertEqual(user.role, User.Role.STUDENT)

    def test_patch_me_requires_csrf_when_enforced(self):
        self.create_user(email="profile-csrf@example.com")
        client = APIClient(enforce_csrf_checks=True)

        token = client.get(CSRF_URL).cookies["csrftoken"].value
        login_response = client.post(
            LOGIN_URL,
            {"email": "profile-csrf@example.com", "password": self.password},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)

        token = client.get(CSRF_URL).cookies["csrftoken"].value
        blocked = client.patch(ME_URL, {"first_name": "Nina"}, format="json")
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(blocked.json()["error"]["code"], "csrf_failed")

        allowed = client.patch(
            ME_URL,
            {"first_name": "Nina"},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
        self.assertEqual(allowed.json()["first_name"], "Nina")

    def test_login_is_case_insensitive_on_email(self):
        self.create_user(email="login@example.com")

        response = self.client.post(
            LOGIN_URL,
            {"email": "LOGIN@EXAMPLE.COM", "password": self.password},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["email"], "login@example.com")

        me = self.client.get(ME_URL)
        self.assertEqual(me.status_code, status.HTTP_200_OK)

    def test_login_rejects_invalid_password(self):
        self.create_user(email="wrong@example.com")

        response = self.client.post(
            LOGIN_URL,
            {"email": "wrong@example.com", "password": "BadPassword123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.json()["error"]["code"], "invalid_credentials")
        self.assertEqual(self.client.get(ME_URL).status_code, 401)

    def test_login_rejects_inactive_user(self):
        self.create_user(email="inactive@example.com", is_active=False)

        response = self.client.post(
            LOGIN_URL,
            {"email": "inactive@example.com", "password": self.password},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_throttles_after_five_failures(self):
        self.create_user(email="throttle@example.com")
        payload = {"email": "throttle@example.com", "password": "BadPassword123!"}

        for _ in range(5):
            response = self.client.post(LOGIN_URL, payload, format="json")
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        blocked = self.client.post(LOGIN_URL, payload, format="json")
        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(blocked.json()["error"]["code"], "throttled")

        still_blocked = self.client.post(
            LOGIN_URL,
            {"email": "throttle@example.com", "password": self.password},
            format="json",
        )
        self.assertEqual(still_blocked.status_code, 429)

    def test_successful_login_resets_throttle_counter(self):
        self.create_user(email="reset@example.com")
        bad_payload = {"email": "reset@example.com", "password": "BadPassword123!"}
        good_payload = {"email": "reset@example.com", "password": self.password}

        for _ in range(4):
            self.client.post(LOGIN_URL, bad_payload, format="json")

        self.assertEqual(
            self.client.post(LOGIN_URL, good_payload, format="json").status_code,
            status.HTTP_200_OK,
        )

        for _ in range(4):
            response = self.client.post(LOGIN_URL, bad_payload, format="json")
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        self.assertEqual(
            self.client.post(LOGIN_URL, good_payload, format="json").status_code,
            status.HTTP_200_OK,
        )

    def test_logout_ends_the_session(self):
        self.create_user(email="logout@example.com")
        login_response = self.client.post(
            LOGIN_URL,
            {"email": "logout@example.com", "password": self.password},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)

        logout_response = self.client.post(LOGOUT_URL)
        self.assertEqual(logout_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.client.get(ME_URL).status_code, 401)

    def test_unknown_api_route_returns_json_404(self):
        response = self.client.get("/api/does-not-exist/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.json()["error"]["code"], "not_found")


class MediaTestCase(APITestCase):
    password = "StrongPass123!"

    @classmethod
    def setUpClass(cls):
        cls.media_root = tempfile.mkdtemp(prefix="edumind-test-media-")
        cls.media_override = override_settings(MEDIA_ROOT=cls.media_root)
        cls.media_override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls.media_override.disable()
        shutil.rmtree(cls.media_root, ignore_errors=True)

    def setUp(self):
        cache.clear()

    def create_user(self, **overrides):
        data = {
            "email": "avatar@example.com",
            "password": self.password,
            "first_name": "Louis",
            "last_name": "Bernard",
        }
        data.update(overrides)
        return User.objects.create_user(**data)

    def avatar_file(self, name="photo.png", content=PNG_1PX, content_type="image/png"):
        return SimpleUploadedFile(name, content, content_type=content_type)


class AvatarApiTests(MediaTestCase):
    def test_patch_me_uploads_avatar_and_serves_it_privately(self):
        user = self.create_user()
        self.client.force_authenticate(user)

        response = self.client.patch(
            ME_URL,
            {"avatar": self.avatar_file()},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertIsNotNone(body["avatar_url"])
        self.assertTrue(body["avatar_url"].startswith(AVATAR_URL))
        self.assertIn("?v=", body["avatar_url"])

        user.refresh_from_db()
        self.assertTrue(user.avatar.name.startswith("avatars/"))
        self.assertTrue(user.avatar.name.endswith(".png"))
        self.assertTrue(Path(self.media_root, user.avatar.name).exists())

        image = self.client.get(AVATAR_URL)
        self.assertEqual(image.status_code, status.HTTP_200_OK)
        self.assertEqual(image["Content-Type"], "image/png")
        self.assertEqual(image["Content-Disposition"], "inline")
        self.assertEqual(image["Cache-Control"], "private, no-store")
        self.assertEqual(b"".join(image.streaming_content), PNG_1PX)

    def test_patch_me_accepts_jpeg_avatar(self):
        user = self.create_user(email="jpeg@example.com")
        self.client.force_authenticate(user)

        response = self.client.patch(
            ME_URL,
            {
                "avatar": self.avatar_file(
                    name="photo.jpeg",
                    content=JPEG_1PX,
                    content_type="image/jpeg",
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.avatar.name.endswith(".jpg"))

    def test_patch_me_replacing_avatar_deletes_previous_file(self):
        user = self.create_user(email="replace@example.com")
        self.client.force_authenticate(user)

        self.client.patch(
            ME_URL,
            {"avatar": self.avatar_file()},
            format="multipart",
        )
        user.refresh_from_db()
        previous_name = user.avatar.name

        response = self.client.patch(
            ME_URL,
            {
                "avatar": self.avatar_file(
                    name="second.jpg",
                    content=JPEG_1PX,
                    content_type="image/jpeg",
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertNotEqual(user.avatar.name, previous_name)
        self.assertFalse(Path(self.media_root, previous_name).exists())
        self.assertTrue(Path(self.media_root, user.avatar.name).exists())

    def test_patch_me_rejects_non_image_content(self):
        user = self.create_user(email="fake@example.com")
        self.client.force_authenticate(user)

        response = self.client.patch(
            ME_URL,
            {
                "avatar": self.avatar_file(
                    content=b"definitely not an image",
                    content_type="image/png",
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("avatar", response.json()["error"]["fields"])
        user.refresh_from_db()
        self.assertFalse(user.avatar)

    def test_patch_me_rejects_avatar_with_mismatched_extension(self):
        user = self.create_user(email="mismatch@example.com")
        self.client.force_authenticate(user)

        response = self.client.patch(
            ME_URL,
            {"avatar": self.avatar_file(name="photo.jpg")},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("avatar", response.json()["error"]["fields"])

    def test_patch_me_rejects_unsupported_avatar_extension(self):
        user = self.create_user(email="gif@example.com")
        self.client.force_authenticate(user)

        response = self.client.patch(
            ME_URL,
            {"avatar": self.avatar_file(name="photo.gif", content_type="image/gif")},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("avatar", response.json()["error"]["fields"])

    @override_settings(AVATAR_MAX_SIZE_MB=1, AVATAR_MAX_SIZE_BYTES=1024)
    def test_patch_me_rejects_oversized_avatar(self):
        user = self.create_user(email="big@example.com")
        self.client.force_authenticate(user)

        response = self.client.patch(
            ME_URL,
            {"avatar": self.avatar_file(content=PNG_1PX + b"\x00" * 2048)},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("avatar", response.json()["error"]["fields"])

    def test_avatar_endpoint_requires_authentication(self):
        response = self.client.get(AVATAR_URL)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_avatar_endpoint_returns_404_without_avatar(self):
        self.client.force_authenticate(self.create_user(email="noavatar@example.com"))

        response = self.client.get(AVATAR_URL)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.json()["error"]["code"], "not_found")

    def test_user_payload_exposes_null_avatar_url_without_avatar(self):
        user = self.create_user(email="nullavatar@example.com")
        self.client.force_authenticate(user)

        response = self.client.get(ME_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.json()["avatar_url"])


class PasswordChangeApiTests(MediaTestCase):
    def login(self, email, password=None):
        return self.client.post(
            LOGIN_URL,
            {"email": email, "password": password or self.password},
            format="json",
        )

    def payload(self, **overrides):
        data = {
            "current_password": self.password,
            "new_password": "NewStrongPass456!",
            "new_password_confirm": "NewStrongPass456!",
        }
        data.update(overrides)
        return data

    def test_password_change_requires_authentication(self):
        response = self.client.post(PASSWORD_URL, self.payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_password_change_rejects_wrong_current_password(self):
        user = self.create_user(email="wrongcurrent@example.com")
        self.client.force_authenticate(user)

        response = self.client.post(
            PASSWORD_URL,
            self.payload(current_password="NotMyPassword123!"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("current_password", response.json()["error"]["fields"])
        user.refresh_from_db()
        self.assertTrue(user.check_password(self.password))

    def test_password_change_rejects_mismatched_confirmation(self):
        user = self.create_user(email="mismatchpass@example.com")
        self.client.force_authenticate(user)

        response = self.client.post(
            PASSWORD_URL,
            self.payload(new_password_confirm="SomethingElse456!"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password_confirm", response.json()["error"]["fields"])

    def test_password_change_rejects_weak_password(self):
        user = self.create_user(email="weakpass@example.com")
        self.client.force_authenticate(user)

        response = self.client.post(
            PASSWORD_URL,
            self.payload(new_password="12345678", new_password_confirm="12345678"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password", response.json()["error"]["fields"])
        user.refresh_from_db()
        self.assertTrue(user.check_password(self.password))

    def test_password_change_rejects_reusing_current_password(self):
        user = self.create_user(email="samepass@example.com")
        self.client.force_authenticate(user)

        response = self.client.post(
            PASSWORD_URL,
            self.payload(
                new_password=self.password,
                new_password_confirm=self.password,
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password", response.json()["error"]["fields"])

    def test_password_change_updates_password_and_keeps_session(self):
        user = self.create_user(email="changepass@example.com")
        self.assertEqual(self.login("changepass@example.com").status_code, 200)

        response = self.client.post(PASSWORD_URL, self.payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json()["detail"],
            "Your password has been updated.",
        )

        user.refresh_from_db()
        self.assertTrue(user.check_password("NewStrongPass456!"))
        self.assertFalse(user.check_password(self.password))

        self.assertEqual(self.client.get(ME_URL).status_code, 200)
        self.client.post(LOGOUT_URL)
        self.assertEqual(
            self.login("changepass@example.com").status_code,
            status.HTTP_401_UNAUTHORIZED,
        )
        self.assertEqual(
            self.login("changepass@example.com", "NewStrongPass456!").status_code,
            status.HTTP_200_OK,
        )

    def test_password_change_requires_csrf_when_enforced(self):
        self.create_user(email="passcsrf@example.com")
        client = APIClient(enforce_csrf_checks=True)

        token = client.get(CSRF_URL).cookies["csrftoken"].value
        self.assertEqual(
            client.post(
                LOGIN_URL,
                {"email": "passcsrf@example.com", "password": self.password},
                format="json",
                HTTP_X_CSRFTOKEN=token,
            ).status_code,
            status.HTTP_200_OK,
        )

        token = client.get(CSRF_URL).cookies["csrftoken"].value
        blocked = client.post(PASSWORD_URL, self.payload(), format="json")
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(blocked.json()["error"]["code"], "csrf_failed")

        allowed = client.post(
            PASSWORD_URL,
            self.payload(),
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
