from django.contrib import admin
from django.urls import include, path, re_path

from assessments.views import ExerciseViewSet, QuizViewSet
from config.views import ApiConfigView, api_not_found

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path(
        "api/courses/<int:course_id>/quizzes/",
        QuizViewSet.as_view({"get": "list"}),
        name="course-quizzes",
    ),
    path(
        "api/courses/<int:course_id>/exercises/",
        ExerciseViewSet.as_view({"get": "list"}),
        name="course-exercises",
    ),
    path("api/courses/", include("courses.urls")),
    path("api/categories/", include("courses.category_urls")),
    path("api/course-enrollments/", include("courses.enrollment_urls")),
    path("api/", include("assessments.urls")),
    path("api/sessions/", include("sessions.urls")),
    path("api/enrollments/", include("sessions.enrollment_urls")),
    path("api/announcements/", include("announcements.urls")),
    path("api/announcement-enrollments/", include("announcements.enrollment_urls")),
    path("api/config/", ApiConfigView.as_view(), name="api-config"),
    re_path(r"^api(?:/.*)?$", api_not_found),
]

handler404 = "config.exceptions.handler404"
handler500 = "config.exceptions.handler500"
