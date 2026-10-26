from pathlib import Path

from django.conf import settings
from django.contrib.auth import authenticate
from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth.password_validation import validate_password
from django.db import IntegrityError
from django.urls import reverse
from django.utils.crypto import constant_time_compare
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed, Throttled

from .models import User
from .throttling import (
    clear_login_failures,
    is_login_throttled,
    record_login_failure,
)
from .validators import validate_avatar


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "role",
            "role_display",
            "avatar_url",
            "date_joined",
        )
        read_only_fields = fields

    def get_avatar_url(self, user):
        if not user.avatar:
            return None
        version = Path(user.avatar.name).stem
        return f"{reverse('auth-me-avatar')}?v={version}"


class AdminUserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "role",
            "role_display",
            "is_active",
            "is_superuser",
            "date_joined",
        )
        read_only_fields = fields


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(
        max_length=150,
        error_messages={
            "blank": "Enter the user's first name.",
            "required": "Enter the user's first name.",
        },
    )
    last_name = serializers.CharField(
        max_length=150,
        error_messages={
            "blank": "Enter the user's last name.",
            "required": "Enter the user's last name.",
        },
    )
    email = serializers.EmailField(
        error_messages={
            "blank": "Enter the user's email address.",
            "required": "Enter the user's email address.",
            "invalid": "That email address is not valid.",
        }
    )
    role = serializers.ChoiceField(
        choices=User.Role.choices,
        error_messages={"invalid_choice": "That role is not valid."},
    )
    is_active = serializers.BooleanField(
        error_messages={"invalid": "The account status is not valid."},
    )

    class Meta:
        model = User
        fields = ("first_name", "last_name", "email", "role", "is_active")

    def validate_email(self, value):
        email = value.strip().lower()
        duplicates = User.objects.filter(email__iexact=email)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError(
                "An account already exists with this email address."
            )
        return email

    def validate(self, attrs):
        user = self.instance
        actor = self.context["request"].user
        errors = {}

        if user.pk == actor.pk:
            if "role" in attrs and attrs["role"] != user.role:
                errors["role"] = "You cannot change your own role."
            if attrs.get("is_active") is False:
                errors["is_active"] = (
                    "You cannot desactivate your own account."
                )

        if (
            user.is_superuser
            and "role" in attrs
            and attrs["role"] != user.role
        ):
            errors.setdefault(
                "role",
                "A superuser's role cannot be changed.",
            )

        new_role = attrs.get("role", user.role)
        new_active = attrs.get("is_active", user.is_active)
        if user.role == User.Role.ADMIN and user.is_active:
            if new_role != User.Role.ADMIN or not new_active:
                other_admin_exists = (
                    User.objects.filter(
                        role=User.Role.ADMIN,
                        is_active=True,
                    )
                    .exclude(pk=user.pk)
                    .exists()
                )
                if not other_admin_exists:
                    message = "At least one active administrator must remain."
                    if new_role != User.Role.ADMIN:
                        errors.setdefault("role", message)
                    if not new_active:
                        errors.setdefault("is_active", message)

        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def update(self, instance, validated_data):
        try:
            return super().update(instance, validated_data)
        except IntegrityError as error:
            raise serializers.ValidationError(
                {"email": ["An account already exists with this email address."]}
            ) from error


class ProfileUpdateSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(
        max_length=150,
        error_messages={
            "blank": "Enter your first name.",
            "required": "Enter your first name.",
        },
    )
    last_name = serializers.CharField(
        max_length=150,
        error_messages={
            "blank": "Enter your last name.",
            "required": "Enter your last name.",
        },
    )
    email = serializers.EmailField(
        error_messages={
            "blank": "Enter your email address.",
            "required": "Enter your email address.",
            "invalid": "That email address is not valid.",
        }
    )
    avatar = serializers.FileField(
        required=False,
        write_only=True,
        validators=[validate_avatar],
    )

    class Meta:
        model = User
        fields = ("first_name", "last_name", "email", "avatar")

    def validate_email(self, value):
        email = value.strip().lower()
        duplicates = User.objects.filter(email__iexact=email)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError(
                "An account already exists with this email address."
            )
        return email

    def update(self, instance, validated_data):
        previous_avatar = instance.avatar.name if instance.avatar else ""
        try:
            user = super().update(instance, validated_data)
        except IntegrityError as error:
            raise serializers.ValidationError(
                {"email": ["An account already exists with this email address."]}
            ) from error

        if (
            "avatar" in validated_data
            and previous_avatar
            and previous_avatar != user.avatar.name
        ):
            user.avatar.storage.delete(previous_avatar)
        return user


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        error_messages={
            "blank": "Enter your current password.",
            "required": "Enter your current password.",
        },
    )
    new_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        error_messages={
            "blank": "Choose a new password.",
            "required": "Choose a new password.",
        },
    )
    new_password_confirm = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        error_messages={
            "blank": "Confirm your new password.",
            "required": "Confirm your new password.",
        },
    )

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError(
                "The current password is incorrect."
            )
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "The two passwords do not match."}
            )
        if attrs["new_password"] == attrs["current_password"]:
            raise serializers.ValidationError(
                {"new_password": "The new password must be different from the current one."}
            )

        user = self.context["request"].user
        try:
            validate_password(attrs["new_password"], user)
        except DjangoValidationError as error:
            raise serializers.ValidationError(
                {"new_password": error.messages}
            ) from error

        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


class RegisterSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    password_confirm = serializers.CharField(write_only=True, trim_whitespace=False)
    role = serializers.ChoiceField(
        choices=[User.Role.STUDENT, User.Role.TEACHER, User.Role.ADMIN],
        error_messages={"invalid_choice": "That role is not valid."},
    )
    # Required for the admin role only: must match settings.ADMIN_REGISTRATION_CODE.
    admin_code = serializers.CharField(
        write_only=True, required=False, allow_blank=True, trim_whitespace=False
    )

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(
                "An account already exists with this email address."
            )
        return email

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError(
                {"password_confirm": "The two passwords do not match."}
            )

        if attrs["role"] == User.Role.ADMIN:
            expected = settings.ADMIN_REGISTRATION_CODE
            if not expected:
                raise serializers.ValidationError(
                    {"role": "Administrator registration is disabled."}
                )
            if not constant_time_compare(attrs.get("admin_code", ""), expected):
                raise serializers.ValidationError(
                    {"admin_code": "The administrator code is not valid."}
                )

        candidate = User(
            email=attrs["email"],
            first_name=attrs["first_name"],
            last_name=attrs["last_name"],
        )
        try:
            validate_password(attrs["password"], candidate)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": error.messages}) from error

        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        validated_data.pop("admin_code", None)
        password = validated_data.pop("password")
        try:
            return User.objects.create_user(password=password, **validated_data)
        except IntegrityError as error:
            raise serializers.ValidationError(
                {"email": ["An account already exists with this email address."]}
            ) from error


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        email = attrs["email"].strip().lower()
        request = self.context["request"]

        if is_login_throttled(request, email):
            raise Throttled(wait=settings.LOGIN_THROTTLE_WINDOW_SECONDS)

        user = authenticate(
            request=request,
            username=email,
            password=attrs["password"],
        )
        if user is None:
            record_login_failure(request, email)
            raise AuthenticationFailed("Incorrect email or password.")

        clear_login_failures(request, email)
        attrs["user"] = user
        return attrs
