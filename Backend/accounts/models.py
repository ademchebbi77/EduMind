import uuid

from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.db import models
from django.db.models.functions import Lower

from .validators import normalize_avatar_extension, validate_avatar


def user_avatar_path(instance, filename):
    extension = normalize_avatar_extension(filename)
    return f"avatars/{uuid.uuid4().hex}.{extension}"


class UserManager(DjangoUserManager):
    """Manager that uses a lowercased email as both login and username."""

    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("The email address is required.")
        email = email.strip().lower()
        extra_fields.pop("username", None)
        return super().create_user(email, email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.Role.ADMIN)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("A superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("A superuser must have is_superuser=True.")
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    class Role(models.TextChoices):
        STUDENT = "student", "Student"
        TEACHER = "teacher", "Teacher"
        ADMIN = "admin", "Administrator"

    # The email is duplicated in username so the default AbstractUser plumbing
    # stays valid even though users never type a separate username.
    username = models.CharField(max_length=254, unique=True, editable=False)
    email = models.EmailField("email address", unique=True)
    role = models.CharField(
        "role",
        max_length=20,
        choices=Role.choices,
        default=Role.STUDENT,
    )
    avatar = models.FileField(
        "profile photo",
        upload_to=user_avatar_path,
        validators=[validate_avatar],
        blank=True,
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    objects = UserManager()

    class Meta:
        verbose_name = "user"
        verbose_name_plural = "users"
        constraints = [
            models.UniqueConstraint(
                Lower("email"),
                name="accounts_user_email_ci_unique",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
            self.username = self.email
        if self.is_superuser:
            self.role = self.Role.ADMIN
        super().save(*args, **kwargs)

    @property
    def full_name(self):
        return self.get_full_name() or self.email

    def __str__(self):
        return self.email
