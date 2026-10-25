from django.urls import path

from .views import (
    AdminUserDetailView,
    AdminUserListView,
    AtRiskStudentsView,
    CsrfView,
    LoginView,
    LogoutView,
    MeAvatarView,
    MeView,
    PasswordChangeView,
    RegisterView,
)

urlpatterns = [
    path("csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("register/", RegisterView.as_view(), name="auth-register"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("me/avatar/", MeAvatarView.as_view(), name="auth-me-avatar"),
    path("me/password/", PasswordChangeView.as_view(), name="auth-me-password"),
    path("users/", AdminUserListView.as_view(), name="admin-users"),
    path("users/<int:pk>/", AdminUserDetailView.as_view(), name="admin-user-detail"),
    path("at-risk/", AtRiskStudentsView.as_view(), name="at-risk-students"),
]
