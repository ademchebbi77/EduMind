from rest_framework.routers import SimpleRouter

from .views import EnrollmentViewSet

router = SimpleRouter()
router.register("", EnrollmentViewSet, basename="courseenrollment")

urlpatterns = router.urls
