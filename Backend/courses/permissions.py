from rest_framework.permissions import SAFE_METHODS, BasePermission

from accounts.models import User


class CanManageCourse(BasePermission):
    """Read for every authenticated user; writes for teachers and admins.

    Teachers may only modify their own courses; admins may modify any course.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return user.role in {User.Role.TEACHER, User.Role.ADMIN}

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if request.user.role == User.Role.ADMIN:
            return True
        return (
            request.user.role == User.Role.TEACHER
            and obj.owner_id == request.user.id
        )
