"""Who may do what with course comments.

- Students write comments and edit or delete their own.
- The teacher who owns the course replies, and may delete comments on it (moderation).
- Admins may reply to and delete any comment.
"""

from accounts.models import User


def owns_course(user, comment):
    return user.role == User.Role.TEACHER and comment.course.owner_id == user.id


def can_edit_comment(user, comment):
    return comment.author_id == user.id


def can_delete_comment(user, comment):
    return (
        comment.author_id == user.id
        or user.role == User.Role.ADMIN
        or owns_course(user, comment)
    )


def can_reply_to_comment(user, comment):
    return user.role == User.Role.ADMIN or owns_course(user, comment)
