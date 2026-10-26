from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.utils.text import slugify
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, NotFound
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from courses.file_serving import build_file_response
from courses.models import Course

from .models import ChatMessage, Resource, Summary
from .permissions import CanEditOrReadOnly, visible_to
from .serializers import (
    ChatMessageSerializer,
    ChatQuestionSerializer,
    GenerateSummarySerializer,
    ResourceSerializer,
    SummarySerializer,
)
from .services import AIServiceError, GeminiService, ImageGeneratorService

CHAT_HISTORY_TURNS = 6


class AIUnavailable(APIException):
    status_code = 503
    default_code = "ai_unavailable"
    default_detail = "The AI service is unavailable. Try again in a moment."


class AIRequestThrottle(UserRateThrottle):
    """Limits the Gemini calls of each user (free quota of the API key)."""

    scope = "summaries_ai"

    def get_rate(self):
        return f"{settings.SUMMARIES_AI_REQUESTS_PER_HOUR}/hour"


class CourseContentMixin:
    """Shared rules of summaries and resources: visibility, filters and author."""

    permission_classes = [IsAuthenticated, CanEditOrReadOnly]
    filter_backends = [SearchFilter, OrderingFilter]
    ordering_fields = ["title", "created_at", "updated_at"]
    ordering = ["-updated_at"]
    ai_actions = ()

    def get_queryset(self):
        queryset = visible_to(
            self.queryset.select_related("course", "author"), self.request.user
        )
        course = self.request.query_params.get("course")
        if course:
            if not course.isdigit() or not Course.objects.filter(pk=course).exists():
                raise serializers.ValidationError({"course": "This course does not exist."})
            queryset = queryset.filter(course_id=course)
        return queryset

    def get_throttles(self):
        # Only the requests that call the AI are limited, and only when they write.
        if self.action in self.ai_actions and self.request.method == "POST":
            return [AIRequestThrottle()]
        return super().get_throttles()

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


class SummaryViewSet(CourseContentMixin, viewsets.ModelViewSet):
    """CRUD of summaries, plus the AI features: generate, illustration and chat."""

    queryset = Summary.objects.all()
    serializer_class = SummarySerializer
    search_fields = ["title", "content", "course__title"]
    reader_actions = ("chat",)
    ai_actions = ("generate", "illustration", "chat")

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Gemini reads the whole course and writes a structured summary + key concepts."""
        payload = GenerateSummarySerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        course = payload.validated_data["course"]
        try:
            result = GeminiService().summarize(course, payload.validated_data["text"])
        except AIServiceError as error:
            raise AIUnavailable(error.message) from error

        summary = Summary.objects.create(
            course=course, author=request.user, source=Summary.Source.AI, **result
        )
        return Response(self.get_serializer(summary).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post", "delete"])
    def illustration(self, request, pk=None):
        """GET shows the picture, POST generates it (2 steps), DELETE removes it."""
        summary = self.get_object()

        if request.method == "GET":
            if not summary.illustration:
                raise NotFound()
            filename = f"{slugify(summary.title)[:60] or 'summary'}.jpg"
            return build_file_response(
                request, summary.illustration, filename, False, content_type="image/jpeg"
            )

        old_file = summary.illustration.name or None
        if request.method == "DELETE":
            summary.illustration = None
            summary.illustration_prompt = ""
        else:
            try:
                prompt = GeminiService().illustration_prompt(summary)  # step 1: Gemini
                image = ImageGeneratorService().generate(prompt)  # step 2: image service
            except AIServiceError as error:
                raise AIUnavailable(error.message) from error
            summary.illustration.save(f"summary-{summary.pk}.jpg", ContentFile(image), save=False)
            summary.illustration_prompt = prompt
        summary.save()
        if old_file and old_file != (summary.illustration.name or None):
            summary.illustration.storage.delete(old_file)
        return Response(self.get_serializer(summary).data)

    @action(detail=True, methods=["get", "post", "delete"])
    def chat(self, request, pk=None):
        """The course assistant. Each user only sees their own conversation."""
        summary = self.get_object()
        messages = summary.chat_messages.filter(user=request.user)

        if request.method == "GET":
            return Response(ChatMessageSerializer(messages, many=True).data)
        if request.method == "DELETE":
            messages.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        payload = ChatQuestionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        question = payload.validated_data["question"]
        history = list(messages.order_by("-created_at", "-id")[:CHAT_HISTORY_TURNS])[::-1]
        try:
            answer = GeminiService().answer(summary, question, history)
        except AIServiceError as error:
            raise AIUnavailable(error.message) from error

        message = ChatMessage.objects.create(
            summary=summary, user=request.user, question=question, answer=answer
        )
        return Response(ChatMessageSerializer(message).data, status=status.HTTP_201_CREATED)


class ResourceViewSet(CourseContentMixin, viewsets.ModelViewSet):
    """CRUD of pedagogical resources (web links and files)."""

    queryset = Resource.objects.all()
    serializer_class = ResourceSerializer
    search_fields = ["title", "description", "course__title"]

    def get_queryset(self):
        queryset = super().get_queryset()
        kind = self.request.query_params.get("kind")
        if kind in Resource.Kind.values:
            queryset = queryset.filter(kind=kind)
        return queryset

    @action(detail=True, methods=["get"])
    def file(self, request, pk=None):
        resource = self.get_object()
        if not resource.file:
            raise NotFound()
        stem = Path(resource.file_name).stem if resource.file_name else resource.title
        filename = f"{slugify(stem)[:80] or 'resource'}{Path(resource.file.name).suffix.lower()}"
        return build_file_response(request, resource.file, filename, as_attachment=False)
