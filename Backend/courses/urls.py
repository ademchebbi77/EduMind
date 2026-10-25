from rest_framework.routers import SimpleRouter

from .views import CourseViewSet

router = SimpleRouter()
router.register("", CourseViewSet, basename="course")

urlpatterns = router.urls
