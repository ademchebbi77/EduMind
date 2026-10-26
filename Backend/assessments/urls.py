from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    ExerciseViewSet,
    QuizGenerationMetricsView,
    QuizGenerationSourcesView,
    QuizGenerationViewSet,
    QuizViewSet,
)

router = SimpleRouter()
router.register("quizzes", QuizViewSet, basename="quiz")
router.register("exercises", ExerciseViewSet, basename="exercise")
router.register("quiz-generator/jobs", QuizGenerationViewSet, basename="quiz-generation")

urlpatterns = [
    path(
        "quiz-generator/sources/",
        QuizGenerationSourcesView.as_view(),
        name="quiz-generation-sources",
    ),
    path(
        "quiz-generator/metrics/",
        QuizGenerationMetricsView.as_view(),
        name="quiz-generation-metrics",
    ),
    *router.urls,
]
