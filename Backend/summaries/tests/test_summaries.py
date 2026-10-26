"""Summaries & resources: CRUD, permissions and the AI features (HTTP mocked)."""

import io
import json
from unittest import mock

import httpx
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

from accounts.models import User
from assessments.tests.utils import make_user
from courses.tests.utils import TemporaryMediaMixin, build_pdf, create_course
from summaries import services
from summaries.models import ChatMessage, Resource, Summary

DESCRIPTION = (
    "Neural networks are models made of layers of neurons. Each neuron computes a weighted sum "
    "of its inputs and applies an activation function. Training uses backpropagation to compute "
    "the gradient of the loss, and gradient descent updates the weights with a learning rate."
)
JPEG_HEADER = b"\xff\xd8"
AI_SETTINGS = {
    "GEMINI_API_KEY": "gm-test",
    "SUMMARIES_GEMINI_MODELS": ["model-a", "model-b"],
    "SUMMARIES_RETRY_SECONDS": 0,
    "SUMMARIES_IMAGE_PROVIDER": "pollinations",
}


def http_response(status=200, payload=None, content=None, method="POST"):
    request = httpx.Request(method, "https://example.test")
    if content is not None:
        return httpx.Response(status, content=content, request=request)
    return httpx.Response(status, json=payload or {}, request=request)


def gemini_text(text):
    return http_response(payload={"candidates": [{"content": {"parts": [{"text": text}]}}]})


def summary_json():
    return gemini_text(
        json.dumps(
            {
                "title": "Neural networks in short",
                "content": "## Neurons\n- A neuron computes a weighted sum of its inputs.\n## Training\n- Backpropagation computes the gradient.",
                "key_concepts": [
                    {"term": "Neuron", "definition": "A unit that computes a weighted sum."},
                    {"term": "Backpropagation", "definition": "The way gradients are computed."},
                    {"term": "", "definition": "ignored because it has no term"},
                ],
            }
        )
    )


def jpeg_bytes():
    output = io.BytesIO()
    Image.new("RGB", (8, 8), "navy").save(output, format="PNG")
    return output.getvalue()


@override_settings(**AI_SETTINGS)
class SummaryApiTests(TemporaryMediaMixin, APITestCase):
    def setUp(self):
        cache.clear()
        self.teacher = make_user("teacher@test.local", User.Role.TEACHER)
        self.other_teacher = make_user("other@test.local", User.Role.TEACHER)
        self.student = make_user("student@test.local", User.Role.STUDENT)
        self.student2 = make_user("student2@test.local", User.Role.STUDENT)
        self.admin = make_user("admin@test.local", User.Role.ADMIN)
        self.course = create_course(self.teacher, title="Neural networks", description=DESCRIPTION)

    def summary(self, author=None, **fields):
        fields.setdefault("title", "Summary")
        fields.setdefault("content", "## Intro\n- Neural networks learn from data.")
        return Summary.objects.create(course=self.course, author=author or self.teacher, **fields)

    def payload(self, **overrides):
        data = {
            "course": self.course.pk,
            "title": "My summary",
            "content": "## Idea\n- Gradient descent updates the weights step by step.",
            "key_concepts": [{"term": "Gradient", "definition": "Direction of steepest increase."}],
        }
        data.update(overrides)
        return data

    # --- CRUD --------------------------------------------------------------------

    def test_teacher_creates_reads_updates_and_deletes_a_summary(self):
        self.client.force_authenticate(self.teacher)
        created = self.client.post("/api/summaries/", self.payload(), format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["source"], "manual")
        self.assertEqual(created.data["language"], "en")
        self.assertTrue(created.data["is_shared"])
        self.assertTrue(created.data["can_edit"])
        url = f"/api/summaries/{created.data['id']}/"

        self.assertEqual(self.client.get(url).data["title"], "My summary")
        updated = self.client.patch(url, {"title": "Renamed"}, format="json")
        self.assertEqual(updated.data["title"], "Renamed")
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertFalse(Summary.objects.exists())

    def test_language_is_detected_from_the_content(self):
        self.client.force_authenticate(self.teacher)
        content = "## Idée\n- La descente de gradient met à jour les poids du réseau de neurones."
        response = self.client.post("/api/summaries/", self.payload(content=content), format="json")
        self.assertEqual(response.data["language"], "fr")

    def test_validation_errors(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.post(
            "/api/summaries/",
            self.payload(title="  ", content="short", key_concepts=[{"term": "x"}]),
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.data["error"]["fields"]), {"title", "content", "key_concepts"})

    def test_student_summaries_are_private_notes(self):
        note = self.summary(author=self.student, title="My note")
        shared = self.summary(title="Teacher summary")

        self.client.force_authenticate(self.student2)
        titles = [item["title"] for item in self.client.get("/api/summaries/").data["results"]]
        self.assertEqual(titles, ["Teacher summary"])
        self.assertEqual(self.client.get(f"/api/summaries/{note.pk}/").status_code, 404)

        self.client.force_authenticate(self.student)
        titles = {item["title"] for item in self.client.get("/api/summaries/").data["results"]}
        self.assertEqual(titles, {"My note", "Teacher summary"})
        detail = self.client.get(f"/api/summaries/{shared.pk}/").data
        self.assertFalse(detail["can_edit"])

        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get("/api/summaries/").data["count"], 2)

    def test_only_editors_can_change_a_summary(self):
        shared = self.summary()
        url = f"/api/summaries/{shared.pk}/"
        for user in (self.student, self.other_teacher):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.patch(url, {"title": "x"}, format="json").status_code, 403)
            self.assertEqual(self.client.delete(url).status_code, 403)

        # A teacher can edit the summaries of the courses they own.
        written_by_other = self.summary(author=self.other_teacher)
        self.client.force_authenticate(self.teacher)
        response = self.client.patch(f"/api/summaries/{written_by_other.pk}/", {"title": "Fixed"}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_student_can_manage_their_own_summary(self):
        self.client.force_authenticate(self.student)
        created = self.client.post("/api/summaries/", self.payload(), format="json")
        self.assertEqual(created.status_code, 201)
        self.assertFalse(created.data["is_shared"])
        url = f"/api/summaries/{created.data['id']}/"
        self.assertEqual(self.client.patch(url, {"title": "Mine"}, format="json").status_code, 200)
        self.assertEqual(self.client.delete(url).status_code, 204)

    def test_filter_by_course_and_search(self):
        other_course = create_course(self.teacher, title="Databases", description="SQL basics")
        self.summary(title="Backprop")
        Summary.objects.create(course=other_course, author=self.teacher, title="Joins", content="x" * 30)
        self.client.force_authenticate(self.student)
        by_course = self.client.get("/api/summaries/", {"course": other_course.pk}).data["results"]
        self.assertEqual([item["title"] for item in by_course], ["Joins"])
        found = self.client.get("/api/summaries/", {"search": "backprop"}).data["results"]
        self.assertEqual([item["title"] for item in found], ["Backprop"])
        self.assertEqual(self.client.get("/api/summaries/", {"course": "abc"}).status_code, 400)

    def test_requires_authentication(self):
        self.assertEqual(self.client.get("/api/summaries/").status_code, 401)

    # --- AI generation -----------------------------------------------------------

    def test_generate_creates_an_ai_summary_with_key_concepts(self):
        self.client.force_authenticate(self.teacher)
        with mock.patch.object(services.httpx, "post", return_value=summary_json()) as post:
            response = self.client.post("/api/summaries/generate/", {"course": self.course.pk}, format="json")

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["source"], "ai")
        self.assertEqual(response.data["ai_model"], "model-a")
        self.assertEqual(response.data["title"], "Neural networks in short")
        self.assertEqual([c["term"] for c in response.data["key_concepts"]], ["Neuron", "Backpropagation"])
        sent = post.call_args.kwargs
        self.assertEqual(sent["headers"], {"x-goog-api-key": "gm-test"})
        self.assertIn("weighted sum", sent["json"]["contents"][-1]["parts"][0]["text"])
        self.assertEqual(sent["json"]["generationConfig"]["responseMimeType"], "application/json")

    def test_generate_falls_back_to_the_next_model_when_busy(self):
        self.client.force_authenticate(self.teacher)
        replies = [http_response(503, {"error": "busy"}), summary_json()]
        with mock.patch.object(services.httpx, "post", side_effect=replies) as post:
            response = self.client.post("/api/summaries/generate/", {"course": self.course.pk}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["ai_model"], "model-b")
        self.assertIn("model-b", post.call_args.args[0])

    def test_generate_returns_503_when_every_model_fails(self):
        self.client.force_authenticate(self.teacher)
        with mock.patch.object(services.httpx, "post", return_value=http_response(503)) as post:
            response = self.client.post("/api/summaries/generate/", {"course": self.course.pk}, format="json")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["error"]["code"], "ai_unavailable")
        self.assertEqual(post.call_count, 4)  # 2 models x 2 rounds
        self.assertFalse(Summary.objects.exists())

    def test_rejected_key_is_not_retried(self):
        self.client.force_authenticate(self.teacher)
        with mock.patch.object(services.httpx, "post", return_value=http_response(403)) as post:
            response = self.client.post("/api/summaries/generate/", {"course": self.course.pk}, format="json")
        self.assertEqual(response.status_code, 503)
        self.assertIn("API key", response.data["error"]["message"])
        self.assertEqual(post.call_count, 1)

    def test_generate_needs_course_content(self):
        empty = create_course(self.teacher, title="Empty", content=build_pdf("", ""))
        self.client.force_authenticate(self.teacher)
        with mock.patch.object(services.httpx, "post") as post:
            response = self.client.post("/api/summaries/generate/", {"course": empty.pk}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("course", response.data["error"]["fields"])
        post.assert_not_called()

    @override_settings(GEMINI_API_KEY="")
    def test_generate_without_key(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.post("/api/summaries/generate/", {"course": self.course.pk}, format="json")
        self.assertEqual(response.status_code, 503)
        self.assertIn("not configured", response.data["error"]["message"])

    @override_settings(SUMMARIES_AI_REQUESTS_PER_HOUR=1)
    def test_ai_requests_are_rate_limited(self):
        self.client.force_authenticate(self.student)
        with mock.patch.object(services.httpx, "post", return_value=summary_json()):
            first = self.client.post("/api/summaries/generate/", {"course": self.course.pk}, format="json")
            second = self.client.post("/api/summaries/generate/", {"course": self.course.pk}, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 429)
        # Normal reads are not limited.
        self.assertEqual(self.client.get("/api/summaries/").status_code, 200)

    # --- Illustration ------------------------------------------------------------

    def test_illustration_in_two_steps(self):
        summary = self.summary()
        self.client.force_authenticate(self.teacher)
        with (
            mock.patch.object(services.httpx, "post", return_value=gemini_text("A flat neuron diagram")) as post,
            mock.patch.object(services.httpx, "get", return_value=http_response(content=jpeg_bytes(), method="GET")) as get,
        ):
            response = self.client.post(f"/api/summaries/{summary.pk}/illustration/")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["illustration_prompt"], "A flat neuron diagram")
        self.assertIn("Neural networks learn", post.call_args.kwargs["json"]["contents"][-1]["parts"][0]["text"])
        self.assertIn("A%20flat%20neuron%20diagram", get.call_args.args[0])

        image = self.client.get(response.data["illustration_url"])
        self.assertEqual(image.status_code, 200)
        self.assertEqual(image["Content-Type"], "image/jpeg")
        self.assertTrue(b"".join(image.streaming_content).startswith(JPEG_HEADER))
        summary.refresh_from_db()
        self.assertTrue(summary.illustration.name.endswith(".jpg"))

        stored = summary.illustration.name
        self.assertEqual(self.client.delete(f"/api/summaries/{summary.pk}/illustration/").status_code, 200)
        summary.refresh_from_db()
        self.assertFalse(summary.illustration)
        self.assertFalse(summary.illustration.storage.exists(stored))

    def test_invalid_image_is_rejected(self):
        summary = self.summary()
        self.client.force_authenticate(self.teacher)
        with (
            mock.patch.object(services.httpx, "post", return_value=gemini_text("prompt")),
            mock.patch.object(services.httpx, "get", return_value=http_response(content=b"<html>", method="GET")),
        ):
            response = self.client.post(f"/api/summaries/{summary.pk}/illustration/")
        self.assertEqual(response.status_code, 503)
        summary.refresh_from_db()
        self.assertFalse(summary.illustration)

    def test_readers_cannot_generate_an_illustration(self):
        summary = self.summary()
        self.client.force_authenticate(self.student)
        with mock.patch.object(services.httpx, "post") as post:
            response = self.client.post(f"/api/summaries/{summary.pk}/illustration/")
        self.assertEqual(response.status_code, 403)
        post.assert_not_called()

    @override_settings(SUMMARIES_IMAGE_PROVIDER="gemini")
    def test_gemini_image_provider(self):
        import base64

        reply = http_response(
            payload={"candidates": [{"content": {"parts": [{"inlineData": {"data": base64.b64encode(jpeg_bytes()).decode()}}]}}]}
        )
        data = services.ImageGeneratorService()
        with mock.patch.object(services.httpx, "post", return_value=reply):
            self.assertTrue(data.generate("prompt").startswith(JPEG_HEADER))

    # --- Course chat ---------------------------------------------------------------

    def test_student_chats_with_the_course_assistant(self):
        summary = self.summary()
        url = f"/api/summaries/{summary.pk}/chat/"
        self.client.force_authenticate(self.student)
        with mock.patch.object(services.httpx, "post", return_value=gemini_text("It is the **step size**.")) as post:
            first = self.client.post(url, {"question": "What is the learning rate?"}, format="json")
            self.client.post(url, {"question": "And the gradient?"}, format="json")

        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data["answer"], "It is the step size.")
        body = post.call_args.kwargs["json"]
        system = body["systemInstruction"]["parts"][0]["text"]
        self.assertIn("gradient descent updates the weights", system)  # full course text
        self.assertIn("Neural networks learn from data", system)  # the summary
        # The previous exchange is sent as history.
        self.assertEqual([turn["role"] for turn in body["contents"]], ["user", "model", "user"])

        history = self.client.get(url).data
        self.assertEqual([m["question"] for m in history], ["What is the learning rate?", "And the gradient?"])

        # Each user only sees their own conversation.
        self.client.force_authenticate(self.student2)
        self.assertEqual(self.client.get(url).data, [])

        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertFalse(ChatMessage.objects.exists())

    def test_chat_question_is_required(self):
        summary = self.summary()
        self.client.force_authenticate(self.student)
        response = self.client.post(f"/api/summaries/{summary.pk}/chat/", {"question": " "}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_cannot_chat_about_someone_elses_private_note(self):
        note = self.summary(author=self.student)
        self.client.force_authenticate(self.student2)
        response = self.client.post(f"/api/summaries/{note.pk}/chat/", {"question": "Hi?"}, format="json")
        self.assertEqual(response.status_code, 404)


class ResourceApiTests(TemporaryMediaMixin, APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@test.local", User.Role.TEACHER)
        self.student = make_user("student@test.local", User.Role.STUDENT)
        self.course = create_course(self.teacher, title="Neural networks")

    def test_link_resource_crud(self):
        self.client.force_authenticate(self.teacher)
        created = self.client.post(
            "/api/resources/",
            {"course": self.course.pk, "title": "3Blue1Brown", "kind": "link", "url": "https://www.youtube.com/watch?v=aircAruvnKk"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        url = f"/api/resources/{created.data['id']}/"
        self.assertEqual(self.client.patch(url, {"description": "Great video"}, format="json").data["description"], "Great video")

        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get("/api/resources/").data["count"], 1)
        self.assertEqual(self.client.delete(url).status_code, 403)

        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.delete(url).status_code, 204)

    def test_file_resource_is_validated_and_served(self):
        self.client.force_authenticate(self.teacher)
        bad = self.client.post(
            "/api/resources/",
            {"course": self.course.pk, "title": "Slides", "kind": "file", "file": SimpleUploadedFile("x.pdf", b"not a pdf")},
            format="multipart",
        )
        self.assertEqual(bad.status_code, 400)
        self.assertIn("file", bad.data["error"]["fields"])

        pdf = SimpleUploadedFile("slides.pdf", build_pdf("Slides", "Week 1"), content_type="application/pdf")
        created = self.client.post(
            "/api/resources/",
            {"course": self.course.pk, "title": "Slides", "kind": "file", "file": pdf},
            format="multipart",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["file_name"], "slides.pdf")
        served = self.client.get(created.data["file_url"])
        self.assertEqual(served.status_code, 200)
        self.assertEqual(served["Content-Type"], "application/pdf")
        self.assertTrue(b"".join(served.streaming_content).startswith(b"%PDF"))

        # Switching to a link deletes the stored file.
        resource = Resource.objects.get()
        stored = resource.file.name
        self.client.patch(
            f"/api/resources/{resource.pk}/", {"kind": "link", "url": "https://example.com"}, format="json"
        )
        resource.refresh_from_db()
        self.assertFalse(resource.file)
        self.assertFalse(resource.file.storage.exists(stored))

    def test_link_needs_url_and_file_needs_file(self):
        self.client.force_authenticate(self.student)
        no_url = self.client.post("/api/resources/", {"course": self.course.pk, "title": "x", "kind": "link"}, format="json")
        self.assertIn("url", no_url.data["error"]["fields"])
        no_file = self.client.post("/api/resources/", {"course": self.course.pk, "title": "x", "kind": "file"}, format="json")
        self.assertIn("file", no_file.data["error"]["fields"])

    def test_student_resources_are_private(self):
        Resource.objects.create(course=self.course, author=self.student, title="Mine", url="https://a.example")
        other = make_user("student2@test.local", User.Role.STUDENT)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get("/api/resources/").data["count"], 0)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get("/api/resources/").data["results"][0]["is_shared"], False)

    def test_course_deletion_removes_resource_files(self):
        self.client.force_authenticate(self.teacher)
        pdf = SimpleUploadedFile("slides.pdf", build_pdf("Slides", "Week 1"), content_type="application/pdf")
        self.client.post(
            "/api/resources/",
            {"course": self.course.pk, "title": "Slides", "kind": "file", "file": pdf},
            format="multipart",
        )
        stored = Resource.objects.get().file
        name, storage = stored.name, stored.storage
        self.course.delete()
        self.assertFalse(storage.exists(name))
