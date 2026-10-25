from rest_framework.routers import SimpleRouter

from .views import SessionEnrollmentViewSet

router = SimpleRouter()
router.register("", SessionEnrollmentViewSet, basename="sessionenrollment")

urlpatterns = router.urls
