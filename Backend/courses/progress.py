"""Course progress derived from how much of the material was actually viewed."""

import logging

from django.utils import timezone
from pypdf import PdfReader

from .models import Course, CourseProgress

logger = logging.getLogger(__name__)


def _sync_pdf_page_count(progress):
    course = progress.enrollment.course
    if (
        course.type != Course.Type.PDF
        or not course.file
        or progress.total_pages
    ):
        return

    try:
        with course.file.storage.open(course.file.name, "rb") as handle:
            progress.total_pages = len(PdfReader(handle).pages)
    except Exception:
        logger.warning(
            "Unable to count the pages of course %s.",
            course.pk,
            exc_info=True,
        )
        return

    if progress.total_pages:
        progress.pages_viewed = min(progress.pages_viewed, progress.total_pages)
        progress.save(update_fields=["total_pages", "pages_viewed"])


def get_or_create_progress(enrollment):
    progress, _ = CourseProgress.objects.get_or_create(enrollment=enrollment)
    _sync_pdf_page_count(progress)
    return progress


def record_progress(progress, data):
    """Apply a viewing update, keeping the furthest position reached."""
    course = progress.enrollment.course
    now = timezone.now()
    changed = set()

    def furthest(field, value):
        if value is not None and value > getattr(progress, field):
            setattr(progress, field, value)
            changed.add(field)

    furthest("video_duration_seconds", data.get("video_duration_seconds"))
    furthest("video_watched_seconds", data.get("video_watched_seconds"))
    furthest("total_pages", data.get("total_pages"))
    furthest("pages_viewed", data.get("pages_viewed"))

    if progress.video_duration_seconds:
        if progress.video_watched_seconds > progress.video_duration_seconds:
            progress.video_watched_seconds = progress.video_duration_seconds
            changed.add("video_watched_seconds")

    if progress.total_pages:
        if progress.pages_viewed > progress.total_pages:
            progress.pages_viewed = progress.total_pages
            changed.add("pages_viewed")

    position = data.get("last_position_seconds")
    if position is not None and position != progress.last_position_seconds:
        if progress.video_duration_seconds:
            position = min(position, progress.video_duration_seconds)
        progress.last_position_seconds = position
        changed.add("last_position_seconds")

    if changed or data.get("has_opened_material"):
        if not progress.has_opened_material:
            progress.has_opened_material = True
            changed.add("has_opened_material")
        if progress.first_viewed_at is None:
            progress.first_viewed_at = now
            changed.add("first_viewed_at")
        progress.last_viewed_at = now
        changed.add("last_viewed_at")

    if changed:
        progress.save(update_fields=sorted(changed))

    if not progress.completed and progress.has_opened_material:
        watched_material = (
            course.type in {Course.Type.VIDEO, Course.Type.AUDIO}
            and progress.video_duration_seconds
            and progress.video_watched_seconds
            >= progress.video_duration_seconds
        )
        read_material = (
            course.type == Course.Type.PDF
            and progress.total_pages
            and progress.pages_viewed >= progress.total_pages
        )
        if watched_material or read_material:
            progress.mark_completed()

    return progress
