from rest_framework.routers import SimpleRouter

from .views import AnnouncementEnrollmentViewSet, AnnouncementViewSet

router = SimpleRouter()
router.register("", AnnouncementViewSet, basename="announcement")

enrollment_router = SimpleRouter()
enrollment_router.register("", AnnouncementEnrollmentViewSet, basename="announcement-enrollment")

urlpatterns = router.urls

# Importable depuis config/urls.py
enrollment_urlpatterns = enrollment_router.urls
