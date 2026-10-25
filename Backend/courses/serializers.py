import logging

from django.urls import reverse
from rest_framework import serializers

from .models import Course
from .validators import validate_course_file

logger = logging.getLogger(__name__)


class CourseSerializer(serializers.ModelSerializer):
    file = serializers.FileField(
        write_only=True,
        required=False,
        validators=[validate_course_file],
    )
    type = serializers.CharField(read_only=True)
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)
    file_url = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = (
            "id",
            "title",
            "description",
            "type",
            "type_display",
            "file",
            "file_url",
            "download_url",
            "owner",
            "owner_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "owner", "created_at", "updated_at")

    def get_file_url(self, obj):
        return reverse("course-file", kwargs={"pk": obj.pk})

    def get_download_url(self, obj):
        return reverse("course-download", kwargs={"pk": obj.pk})

    def validate(self, attrs):
        if self.instance is None and not attrs.get("file"):
            raise serializers.ValidationError(
                {"file": "A file is required to create a course."}
            )
        return attrs

    def update(self, instance, validated_data):
        old_file = instance.file
        old_name = old_file.name if old_file else None
        old_storage = old_file.storage if old_file else None

        updated = super().update(instance, validated_data)

        new_file = validated_data.get("file")
        if new_file and old_name and old_name != updated.file.name:
            try:
                if old_storage.exists(old_name):
                    old_storage.delete(old_name)
            except Exception:
                logger.exception(
                    "Unable to delete the course's previous file %s",
                    instance.pk,
                )
        return updated
