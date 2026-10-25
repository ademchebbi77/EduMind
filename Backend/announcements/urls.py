from rest_framework.routers import SimpleRouter

from .views import AnnouncementViewSet

router = SimpleRouter()
router.register("", AnnouncementViewSet, basename="announcement")

urlpatterns = router.urls
