from django.contrib import admin
from django.urls import include, path, re_path

from config.views import ApiConfigView, api_not_found

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/courses/", include("courses.urls")),
    path("api/config/", ApiConfigView.as_view(), name="api-config"),
    re_path(r"^api(?:/.*)?$", api_not_found),
]

handler404 = "config.exceptions.handler404"
handler500 = "config.exceptions.handler500"
