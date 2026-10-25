from rest_framework.authentication import SessionAuthentication


class SessionAuthentication401(SessionAuthentication):
    """Session authentication that answers 401 (not 403) when unauthenticated."""

    def authenticate_header(self, request):
        return "Session"
