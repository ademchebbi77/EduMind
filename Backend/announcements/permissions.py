from rest_framework.permissions import SAFE_METHODS, BasePermission

from accounts.models import User


class CanManageAnnouncement(BasePermission):
    """
    - Lecture : tout utilisateur authentifié (filtrée par audience côté queryset).
    - Création / Modification / Suppression : admin ou teacher.
    - Un teacher ne peut modifier/supprimer que ses propres annonces.
    - Un admin peut tout faire.
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
        user = request.user
        if user.role == User.Role.ADMIN:
            return True
        return user.role == User.Role.TEACHER and obj.author_id == user.id
