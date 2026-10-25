from rest_framework.routers import SimpleRouter

from .views import LiveSessionViewSet

router = SimpleRouter()
router.register("", LiveSessionViewSet, basename="livesession")

urlpatterns = router.urls
