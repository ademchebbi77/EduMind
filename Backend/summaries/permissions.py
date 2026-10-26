from django.db.models import Q
from rest_framework.permissions import SAFE_METHODS, BasePermission

from accounts.models import User


def visible_to(queryset, user):
    """Who sees what.

    Summaries and resources written by teachers or admins are shared with everyone.
    Those written by a student are private notes: only their author (and admins) see them.
    """
    if user.role == User.Role.ADMIN:
        return queryset
    return queryset.filter(Q(author=user) | ~Q(author__role=User.Role.STUDENT))


def can_edit(user, item):
    """The author, the teacher who owns the course, or an admin can edit or delete."""
    if user.role == User.Role.ADMIN or item.author_id == user.id:
        return True
    return user.role == User.Role.TEACHER and item.course.owner_id == user.id


class CanEditOrReadOnly(BasePermission):
    """Read for every signed-in user who can see the item; write for its editors.

    Actions listed in ``view.reader_actions`` (the course chat) are open to readers.
    """

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS or view.action in getattr(view, "reader_actions", ()):
            return True
        return can_edit(request.user, obj)
