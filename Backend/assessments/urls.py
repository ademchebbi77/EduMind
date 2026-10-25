from rest_framework.routers import SimpleRouter

from .views import ExerciseViewSet, QuizViewSet

router = SimpleRouter()
router.register("quizzes", QuizViewSet, basename="quiz")
router.register("exercises", ExerciseViewSet, basename="exercise")

urlpatterns = router.urls
