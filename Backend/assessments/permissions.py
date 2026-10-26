from rest_framework.permissions import SAFE_METHODS, BasePermission

from accounts.models import User


def can_manage_course(user, course):
    """Admins manage every course; teachers only the courses they own."""
    if not user or not user.is_authenticated:
        return False
    if user.role == User.Role.ADMIN:
        return True
    return user.role == User.Role.TEACHER and course.owner_id == user.id


class CanManageAssessment(BasePermission):
    """Read for every authenticated user; writes for the course owner or admins.

    Visibility of drafts is handled by the view queryset, and course ownership
    on create is checked by the serializer because the object does not exist yet.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        if getattr(view, "action", None) in getattr(view, "student_actions", ()):
            return True
        return user.role in {User.Role.TEACHER, User.Role.ADMIN}

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if getattr(view, "action", None) in getattr(view, "student_actions", ()):
            return True
        return can_manage_course(request.user, obj.course)


class IsTeacherOrAdmin(BasePermission):
    message = "Only teachers and administrators can use the quiz generator."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.role in {User.Role.TEACHER, User.Role.ADMIN}
        )


class IsStudent(BasePermission):
    message = "Only students can perform this action."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == User.Role.STUDENT)
