from rest_framework.routers import SimpleRouter

from .views import ResourceViewSet, SummaryViewSet

router = SimpleRouter()
router.register("summaries", SummaryViewSet, basename="summary")
router.register("resources", ResourceViewSet, basename="resource")

urlpatterns = router.urls
