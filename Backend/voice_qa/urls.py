from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import VoiceConfigView, VoiceQuestionViewSet

router = SimpleRouter()
router.register("", VoiceQuestionViewSet, basename="voice-question")

urlpatterns = [
    path("config/", VoiceConfigView.as_view(), name="voice-config"),
    *router.urls,
]
