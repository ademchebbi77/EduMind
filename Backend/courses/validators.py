from pathlib import Path

import filetype
from django.conf import settings
from django.core.exceptions import ValidationError

ALLOWED_EXTENSIONS = ("pdf", "mp3", "wav", "m4a", "ogg")
PDF_EXTENSIONS = ("pdf",)
AUDIO_EXTENSIONS = ("mp3", "wav", "m4a", "ogg")

ALLOWED_MIME_TYPES = {
    "pdf": {"application/pdf"},
    "mp3": {"audio/mpeg", "audio/mp3"},
    "wav": {"audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"},
    "m4a": {"audio/mp4", "audio/x-m4a", "audio/m4a"},
    "ogg": {"audio/ogg", "application/ogg"},
}

CONTENT_TYPE_BY_EXTENSION = {
    "pdf": "application/pdf",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "m4a": "audio/mp4",
    "ogg": "audio/ogg",
}

GENERIC_CONTENT_TYPES = {"", "application/octet-stream", "binary/octet-stream"}

SIGNATURE_BYTES = 4096


def validate_course_file(file):
    filename = getattr(file, "name", "") or ""
    extension = Path(filename).suffix.lower().lstrip(".")

    if extension not in ALLOWED_EXTENSIONS:
        raise ValidationError(
            "Unsupported extension. Accepted formats: PDF, MP3, WAV, M4A, OGG."
        )

    size = getattr(file, "size", 0) or 0
    if size <= 0:
        raise ValidationError("The file is empty.")
    if size > settings.MAX_UPLOAD_SIZE_BYTES:
        raise ValidationError(
            "The file exceeds the maximum allowed size of "
            f"{settings.MAX_UPLOAD_SIZE_MB} MB."
        )

    declared_type = (getattr(file, "content_type", "") or "").split(";")[0].strip().lower()
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
