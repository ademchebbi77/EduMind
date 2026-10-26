from pathlib import Path

from rest_framework import serializers
from rest_framework.reverse import reverse

from accounts.models import User
from courses.models import Course
from courses.validators import validate_course_file

from .models import ChatMessage, Resource, Summary
from .permissions import can_edit
from .services import AIServiceError, course_text, text_language

MAX_KEY_CONCEPTS = 30


def _can_edit(serializer, obj):
    request = serializer.context.get("request")
    return bool(request and can_edit(request.user, obj))


class SummarySerializer(serializers.ModelSerializer):
    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.all())
    course_title = serializers.CharField(source="course.title", read_only=True)
    author_name = serializers.CharField(source="author.full_name", read_only=True)
    is_shared = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    illustration_url = serializers.SerializerMethodField()

    class Meta:
        model = Summary
        fields = [
            "id",
            "course",
            "course_title",
            "title",
            "content",
            "key_concepts",
            "language",
            "source",
            "ai_model",
            "author_name",
            "is_shared",
            "can_edit",
            "illustration_url",
            "illustration_prompt",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["language", "source", "ai_model", "illustration_prompt"]

    def get_is_shared(self, obj):
        return obj.author.role != User.Role.STUDENT

    def get_can_edit(self, obj):
        return _can_edit(self, obj)

    def get_illustration_url(self, obj):
        if not obj.illustration:
            return None
        # The update time makes the browser reload a regenerated picture.
        url = reverse("summary-illustration", kwargs={"pk": obj.pk})
        return f"{url}?v={int(obj.updated_at.timestamp())}"

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("The title is required.")
        return value

    def validate_content(self, value):
        value = value.strip()
        if len(value) < 20:
            raise serializers.ValidationError("The summary must contain at least 20 characters.")
        return value

    def validate_key_concepts(self, value):
        if not isinstance(value, list) or len(value) > MAX_KEY_CONCEPTS:
            raise serializers.ValidationError(f"Give a list of at most {MAX_KEY_CONCEPTS} concepts.")
        concepts = []
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Each concept needs a term and a definition.")
            term = str(item.get("term") or "").strip()
            definition = str(item.get("definition") or "").strip()
            if not term or not definition:
                raise serializers.ValidationError("Each concept needs a term and a definition.")
            if len(term) > 120 or len(definition) > 600:
                raise serializers.ValidationError(
                    "A term is at most 120 characters and a definition at most 600."
                )
            concepts.append({"term": term, "definition": definition})
        return concepts

    def validate(self, attrs):
        if "content" in attrs:
            attrs["language"] = text_language(attrs["content"])
        return attrs


class GenerateSummarySerializer(serializers.Serializer):
    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.all())

    def validate(self, attrs):
        try:
            attrs["text"] = course_text(attrs["course"])
        except AIServiceError as error:
            raise serializers.ValidationError({"course": error.message}) from error
        return attrs


class ChatQuestionSerializer(serializers.Serializer):
    question = serializers.CharField(max_length=1000, trim_whitespace=True)


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ["id", "question", "answer", "created_at"]


class ResourceSerializer(serializers.ModelSerializer):
    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.all())
    course_title = serializers.CharField(source="course.title", read_only=True)
    author_name = serializers.CharField(source="author.full_name", read_only=True)
    file = serializers.FileField(write_only=True, required=False, validators=[validate_course_file])
    file_url = serializers.SerializerMethodField()
    is_shared = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = Resource
        fields = [
            "id",
            "course",
            "course_title",
            "title",
            "description",
            "kind",
            "url",
            "file",
            "file_name",
            "file_url",
            "author_name",
            "is_shared",
            "can_edit",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["file_name"]

    def get_file_url(self, obj):
        if not obj.file:
            return None
        return reverse("resource-file", kwargs={"pk": obj.pk})

    def get_is_shared(self, obj):
        return obj.author.role != User.Role.STUDENT

    def get_can_edit(self, obj):
        return _can_edit(self, obj)

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("The title is required.")
        return value

    def validate(self, attrs):
        kind = attrs.get("kind", getattr(self.instance, "kind", Resource.Kind.LINK))
        if kind == Resource.Kind.LINK:
            url = attrs.get("url", getattr(self.instance, "url", ""))
            if not url:
                raise serializers.ValidationError({"url": "A web link needs its address."})
            attrs["file"] = None
            attrs["file_name"] = ""
        else:
            upload = attrs.get("file")
            if not upload and not getattr(self.instance, "file", None):
                raise serializers.ValidationError({"file": "Choose the file to share."})
            if upload:
                attrs["file_name"] = Path(upload.name).name[:255]
            attrs["url"] = ""
        return attrs

    def update(self, instance, validated_data):
        old_file = instance.file.name if instance.file else None
        resource = super().update(instance, validated_data)
        # A replaced or removed file is deleted from the disk.
        if old_file and old_file != (resource.file.name or None):
            resource.file.storage.delete(old_file)
        return resource
