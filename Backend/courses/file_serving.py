from pathlib import Path

from django.http import FileResponse, HttpResponse, StreamingHttpResponse
from django.utils.http import content_disposition_header
from django.utils.text import slugify
from rest_framework.exceptions import NotFound

from .validators import CONTENT_TYPE_BY_EXTENSION

INVALID_RANGE = object()
RANGE_CHUNK_SIZE = 8192


def parse_range_header(header: str, size: int):
    """Parse a single HTTP byte range. Returns None, INVALID_RANGE or (start, end)."""
    if not header:
        return None

    header = header.strip()
    if not header.lower().startswith("bytes="):
        return None

    spec = header[6:].strip()
    if not spec or "," in spec or "-" not in spec:
        return None

    start_text, end_text = (part.strip() for part in spec.split("-", 1))
    if not start_text and not end_text:
        return None

    try:
        if not start_text:
            suffix_length = int(end_text)
            if suffix_length <= 0:
                return INVALID_RANGE
            start = max(size - suffix_length, 0)
            end = size - 1
        else:
            start = int(start_text)
            if start < 0 or start >= size:
                return INVALID_RANGE
            if end_text:
                end = int(end_text)
                if end < start:
                    return INVALID_RANGE
                end = min(end, size - 1)
            else:
                end = size - 1
    except ValueError:
        return None

    return start, end


def _display_filename(field_file, title, fallback) -> str:
    extension = Path(field_file.name).suffix.lower()
    base = slugify(title)[:80] or fallback
    return f"{base}{extension}"


def build_course_file_response(request, course, as_attachment: bool):
    return build_file_response(
        request,
        course.file,
        _display_filename(course.file, course.title, "course"),
        as_attachment,
    )


def build_file_response(request, field_file, filename, as_attachment: bool, content_type=None):
    """Serve a private stored file with HTTP Range support."""
    if not field_file:
        raise NotFound("The requested file could not be found.")
    extension = Path(field_file.name).suffix.lower().lstrip(".")
    content_type = content_type or CONTENT_TYPE_BY_EXTENSION.get(
        extension, "application/octet-stream"
    )
    storage = field_file.storage
    file_name = field_file.name

    try:
        size = storage.size(file_name)
    except (FileNotFoundError, OSError) as error:
        raise NotFound("The requested file could not be found.") from error

    if size <= 0:
        raise NotFound("The requested file could not be found.")

    byte_range = parse_range_header(request.headers.get("Range"), size)

    if byte_range is INVALID_RANGE:
        response = HttpResponse(status=416)
        response["Content-Range"] = f"bytes */{size}"
        response["Accept-Ranges"] = "bytes"
        response["Content-Length"] = "0"
        return response

    if byte_range:
        start, end = byte_range
        length = end - start + 1
        try:
            handle = storage.open(file_name, "rb")
        except (FileNotFoundError, OSError) as error:
            raise NotFound("The requested file could not be found.") from error

        def stream():
            try:
                handle.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = handle.read(min(RANGE_CHUNK_SIZE, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk
            finally:
                handle.close()

        response = StreamingHttpResponse(
            stream(),
            status=206,
            content_type=content_type,
        )
        response["Content-Range"] = f"bytes {start}-{end}/{size}"
        response["Content-Length"] = str(length)
    else:
        try:
            handle = storage.open(file_name, "rb")
        except (FileNotFoundError, OSError) as error:
            raise NotFound("The requested file could not be found.") from error
        response = FileResponse(handle, content_type=content_type)

    response["Accept-Ranges"] = "bytes"
    response["Content-Disposition"] = content_disposition_header(
        as_attachment,
        filename,
    )
    response["Cache-Control"] = "private, no-store"
    return response
