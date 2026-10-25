from pathlib import Path

import filetype
from django.conf import settings
from django.core.exceptions import ValidationError

ALLOWED_AVATAR_EXTENSIONS = ("jpg", "jpeg", "png", "webp")

AVATAR_MIME_TYPES = {
    "jpg": {"image/jpeg", "image/jpg"},
    "png": {"image/png"},
    "webp": {"image/webp"},
}

AVATAR_CONTENT_TYPES = {
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}

GENERIC_CONTENT_TYPES = {"", "application/octet-stream", "binary/octet-stream"}

SIGNATURE_BYTES = 4096


def normalize_avatar_extension(filename: str) -> str:
    extension = Path(filename or "").suffix.lower().lstrip(".")
    return "jpg" if extension == "jpeg" else extension


def validate_avatar(file):
    extension = normalize_avatar_extension(getattr(file, "name", ""))

    if extension not in ("jpg", "png", "webp"):
        raise ValidationError(
            "Unsupported format. Use a JPEG, PNG or WebP image."
        )

    size = getattr(file, "size", 0) or 0
    if size <= 0:
        raise ValidationError("The file is empty.")
    if size > settings.AVATAR_MAX_SIZE_BYTES:
        raise ValidationError(
            "The image exceeds the maximum allowed size of "
            f"{settings.AVATAR_MAX_SIZE_MB} MB."
        )

    declared_type = (
        (getattr(file, "content_type", "") or "").split(";")[0].strip().lower()
    )
    if declared_type not in GENERIC_CONTENT_TYPES:
        if declared_type not in AVATAR_MIME_TYPES[extension]:
            raise ValidationError(
                "The declared MIME type does not match the image format."
            )

    initial_position = file.tell() if hasattr(file, "tell") else 0
    try:
        header = file.read(SIGNATURE_BYTES)
    finally:
        if hasattr(file, "seek"):
            file.seek(initial_position)

    kind = filetype.guess(header)
    if kind is None or kind.mime not in {"image/jpeg", "image/png", "image/webp"}:
        raise ValidationError("The file content is not a valid image.")

    detected_extension = "jpg" if kind.extension.lower() == "jpeg" else kind.extension.lower()
    if detected_extension != extension:
        raise ValidationError(
            "The image content does not match its extension."
        )
