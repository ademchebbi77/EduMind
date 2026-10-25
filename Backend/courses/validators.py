from pathlib import Path

import filetype
from django.conf import settings
from django.core.exceptions import ValidationError
from PIL import Image, UnidentifiedImageError

ALLOWED_EXTENSIONS = (
    "pdf",
    "mp3",
    "wav",
    "m4a",
    "ogg",
    "mp4",
    "webm",
    "avi",
)
PDF_EXTENSIONS = ("pdf",)
AUDIO_EXTENSIONS = ("mp3", "wav", "m4a", "ogg")
VIDEO_EXTENSIONS = ("mp4", "webm", "avi")

ALLOWED_MIME_TYPES = {
    "pdf": {"application/pdf"},
    "mp3": {"audio/mpeg", "audio/mp3"},
    "wav": {"audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"},
    "m4a": {"audio/mp4", "audio/x-m4a", "audio/m4a"},
    "ogg": {"audio/ogg", "application/ogg"},
    "mp4": {"video/mp4"},
    "webm": {"video/webm"},
    "avi": {"video/x-msvideo", "video/avi", "video/msvideo"},
}

CONTENT_TYPE_BY_EXTENSION = {
    "pdf": "application/pdf",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "m4a": "audio/mp4",
    "ogg": "audio/ogg",
    "mp4": "video/mp4",
    "webm": "video/webm",
    "avi": "video/x-msvideo",
}

THUMBNAIL_FORMATS = {"JPEG", "PNG", "WEBP"}
THUMBNAIL_EXTENSIONS = ("jpg", "jpeg", "png", "webp")
THUMBNAIL_CONTENT_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}

GENERIC_CONTENT_TYPES = {"", "application/octet-stream", "binary/octet-stream"}

SIGNATURE_BYTES = 4096


def _upload_limit(extension):
    if extension in VIDEO_EXTENSIONS:
        return (
            settings.MAX_VIDEO_UPLOAD_SIZE_BYTES,
            settings.MAX_VIDEO_UPLOAD_SIZE_MB,
        )
    return settings.MAX_UPLOAD_SIZE_BYTES, settings.MAX_UPLOAD_SIZE_MB


def validate_course_file(file):
    filename = getattr(file, "name", "") or ""
    extension = Path(filename).suffix.lower().lstrip(".")

    if extension not in ALLOWED_EXTENSIONS:
        raise ValidationError(
            "Unsupported extension. Accepted formats: "
            "PDF, MP3, WAV, M4A, OGG, MP4, WEBM, AVI."
        )

    size = getattr(file, "size", 0) or 0
    if size <= 0:
        raise ValidationError("The file is empty.")

    max_size_bytes, max_size_mb = _upload_limit(extension)
    if size > max_size_bytes:
        raise ValidationError(
            "The file exceeds the maximum allowed size of "
            f"{max_size_mb} MB."
        )

    declared_type = (
        (getattr(file, "content_type", "") or "").split(";")[0].strip().lower()
    )
    if declared_type not in GENERIC_CONTENT_TYPES:
        if declared_type not in ALLOWED_MIME_TYPES[extension]:
            raise ValidationError(
                "The declared MIME type does not match the file format."
            )

    initial_position = file.tell() if hasattr(file, "tell") else 0
    try:
        header = file.read(SIGNATURE_BYTES)
    finally:
        if hasattr(file, "seek"):
            file.seek(initial_position)

    kind = filetype.guess(header)
    if kind is None:
        raise ValidationError("Unable to verify the file's actual type.")
    if kind.extension.lower() != extension:
        raise ValidationError(
            "The file content does not match its extension."
        )
    if kind.mime.lower() not in ALLOWED_MIME_TYPES[extension]:
        raise ValidationError(
            "The file content does not match the expected format."
        )


def validate_thumbnail(file):
    size = getattr(file, "size", 0) or 0
    if size <= 0:
        raise ValidationError("The image is empty.")
    if size > settings.THUMBNAIL_MAX_SIZE_BYTES:
        raise ValidationError(
            "The image exceeds the maximum allowed size of "
            f"{settings.THUMBNAIL_MAX_SIZE_MB} MB."
        )

    initial_position = file.tell() if hasattr(file, "tell") else 0
    try:
        try:
            with Image.open(file) as image:
                image_format = image.format
                width, height = image.size
                image.verify()
        except (
            UnidentifiedImageError,
            OSError,
            ValueError,
            Image.DecompressionBombError,
        ) as error:
            raise ValidationError(
                "The uploaded file is not a valid image."
            ) from error
    finally:
        if hasattr(file, "seek"):
            file.seek(initial_position)

    if image_format not in THUMBNAIL_FORMATS:
        raise ValidationError(
            "Unsupported image format. Accepted formats: JPG, PNG, WEBP."
        )
    if (
        width > settings.THUMBNAIL_MAX_WIDTH
        or height > settings.THUMBNAIL_MAX_HEIGHT
    ):
        raise ValidationError(
            "The image dimensions must not exceed "
            f"{settings.THUMBNAIL_MAX_WIDTH}x"
            f"{settings.THUMBNAIL_MAX_HEIGHT} pixels."
        )
