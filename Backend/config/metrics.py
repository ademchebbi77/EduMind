"""Prometheus metrics for the EduMind backend.

The endpoint stays disabled until METRICS_TOKEN is configured, and Prometheus
must send that token as a bearer credential, so metrics are never public.
"""

import secrets

from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.http import require_GET

from accounts.models import User
from courses.models import Course


def _unauthorized():
    response = HttpResponse(
        "Unauthorized\n",
        status=401,
        content_type="text/plain; charset=utf-8",
    )
    response["WWW-Authenticate"] = 'Bearer realm="edumind-metrics"'
    response["Cache-Control"] = "no-store"
    return response


@require_GET
def metrics_view(request):
    token = (settings.METRICS_TOKEN or "").strip()
    if not token:
        return HttpResponse(status=404)

    scheme, _, credentials = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(
        credentials.strip().encode("utf-8"), token.encode("utf-8")
    ):
        return _unauthorized()

    teachers = User.objects.filter(role=User.Role.TEACHER).count()
    students = User.objects.filter(role=User.Role.STUDENT).count()
    courses = Course.objects.count()

    lines = [
        "# HELP edumind_users Number of registered EduMind accounts by role.",
        "# TYPE edumind_users gauge",
        f'edumind_users{{role="teacher"}} {teachers}',
        f'edumind_users{{role="student"}} {students}',
        "",
        "# HELP edumind_courses Number of courses in the catalogue.",
        "# TYPE edumind_courses gauge",
        f"edumind_courses {courses}",
        "",
    ]
    response = HttpResponse(
        "\n".join(lines),
        content_type="text/plain; version=0.0.4; charset=utf-8",
    )
    response["Cache-Control"] = "no-store"
    return response
