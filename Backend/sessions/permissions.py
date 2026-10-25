from rest_framework.permissions import SAFE_METHODS, BasePermission

from accounts.models import User


class CanManageSession(BasePermission):
    """
    - Lecture : tout utilisateur authentifié.
    - Création :
        * Teacher → type "course" seulement.
        * Admin   → tous les types.
    - Modification / Suppression :
        * Admin → toute session.
        * Teacher → seulement ses propres sessions de type "course".
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
        return (
            user.role == User.Role.TEACHER
            and obj.created_by_id == user.id
            and obj.session_type == "course"
        )


class CanManageEnrollment(BasePermission):
    """
    - Lecture : admin voit tout ; étudiant voit ses propres inscriptions.
    - Création : étudiant seulement (il s'inscrit lui-même).
    - Mise à jour du statut : admin seulement.
    - Suppression : étudiant (annulation) ou admin.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role == User.Role.ADMIN:
            return True
        if request.method in SAFE_METHODS:
            return obj.student_id == user.id
        if request.method == "DELETE":
            return obj.student_id == user.id
        # PATCH (changement de statut) → admin seulement, déjà couvert ci-dessus
        return False
