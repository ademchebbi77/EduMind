from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import CourseCommentViewSet, VoiceConfigView, VoiceQuestionViewSet, VoiceReviewViewSet

router = SimpleRouter()
# Registered first: otherwise "comments" or "reviews" would be read as a voice question id.
router.register("comments", CourseCommentViewSet, basename="course-comment")
router.register("reviews", VoiceReviewViewSet, basename="voice-review")
router.register("", VoiceQuestionViewSet, basename="voice-question")

urlpatterns = [
    path("config/", VoiceConfigView.as_view(), name="voice-config"),
    *router.urls,
]
