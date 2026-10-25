from rest_framework.routers import SimpleRouter

from .views import AnnouncementEnrollmentViewSet

router = SimpleRouter()
router.register("", AnnouncementEnrollmentViewSet, basename="announcement-enrollment")

urlpatterns = router.urls
