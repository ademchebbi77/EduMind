from django.urls import path
from rest_framework.routers import SimpleRouter

from . import live
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
    # Live quiz game
    path("live-games/", live.create_game, name="live-game-create"),
    path("live-games/join/", live.join_game, name="live-game-join"),
    path("live-games/<int:game_id>/", live.game_detail, name="live-game-detail"),
    path("live-games/<int:game_id>/next/", live.next_step, name="live-game-next"),
    path("live-games/<int:game_id>/answer/", live.answer, name="live-game-answer"),
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
