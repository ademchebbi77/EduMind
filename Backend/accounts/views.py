from pathlib import Path

from django.contrib.auth import login, logout, update_session_auth_hash
from django.http import FileResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import filters, generics, status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import User
from .permissions import IsAdminRole
from .serializers import (
    AdminUserSerializer,
    AdminUserUpdateSerializer,
    LoginSerializer,
    PasswordChangeSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    UserSerializer,
)
from .validators import AVATAR_CONTENT_TYPES


class CsrfView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        response = Response({"detail": "CSRF cookie set."})
        response["Cache-Control"] = "no-store"
        return response


@method_decorator(csrf_protect, name="dispatch")
class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        login(request, user)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        login(request, user)
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(csrf_protect, name="dispatch")
class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = ProfileUpdateSerializer(
            request.user,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data)


class MeAvatarView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        avatar = request.user.avatar
        if not avatar:
            raise NotFound("No profile photo is linked to this account.")

        try:
            handle = avatar.storage.open(avatar.name, "rb")
        except (FileNotFoundError, OSError) as error:
            raise NotFound("The profile photo could not be found.") from error

        extension = Path(avatar.name).suffix.lower().lstrip(".")
        response = FileResponse(
            handle,
            content_type=AVATAR_CONTENT_TYPES.get(extension, "application/octet-stream"),
        )
        response["Content-Disposition"] = "inline"
        response["Cache-Control"] = "private, no-store"
        return response


@method_decorator(csrf_protect, name="dispatch")
class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        update_session_auth_hash(request, user)
        return Response({"detail": "Your password has been updated."})


class AdminUserListView(generics.ListAPIView):
    permission_classes = [IsAdminRole]
    serializer_class = AdminUserSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ("first_name", "last_name", "email")
    ordering_fields = (
        "first_name",
        "last_name",
        "email",
        "role",
        "is_active",
        "date_joined",
    )
    ordering = ("-date_joined",)

    def get_queryset(self):
        queryset = User.objects.all()

        role = self.request.query_params.get("role")
        if role:
            if role not in User.Role.values:
                raise ValidationError({"role": ["That role is not valid."]})
            queryset = queryset.filter(role=role)

        is_active = self.request.query_params.get("is_active")
        if is_active:
            normalized = is_active.strip().lower()
            if normalized not in {"true", "false"}:
                raise ValidationError(
                    {"is_active": ["Set this filter to true or false."]}
                )
            queryset = queryset.filter(is_active=normalized == "true")

        return queryset


@method_decorator(csrf_protect, name="dispatch")
class AdminUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdminRole]
    http_method_names = ["get", "patch", "delete", "head", "options"]
    queryset = User.objects.all()

    def get_serializer_class(self):
        if self.request.method == "PATCH":
            return AdminUserUpdateSerializer
        return AdminUserSerializer

    def update(self, request, *args, **kwargs):
        user = self.get_object()
        serializer = AdminUserUpdateSerializer(
            user,
            data=request.data,
            partial=True,
            context=self.get_serializer_context(),
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(AdminUserSerializer(user).data)

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()

        if user.pk == request.user.pk:
            raise ValidationError(
                {
                    "non_field_errors": [
                        "You cannot delete your own account."
                    ]
                }
            )

        if user.role == User.Role.ADMIN and user.is_active:
            other_admin_exists = (
                User.objects.filter(
                    role=User.Role.ADMIN,
                    is_active=True,
                )
                .exclude(pk=user.pk)
                .exists()
            )
            if not other_admin_exists:
                raise ValidationError(
                    {
                        "non_field_errors": [
                            "At least one active administrator must remain."
                        ]
                    }
                )

        self.perform_destroy(user)
        return Response(status=status.HTTP_204_NO_CONTENT)
