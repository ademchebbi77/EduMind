from django.conf import settings
from django.core.cache import cache
from rest_framework.exceptions import Throttled

DEFAULT_HOURLY_LIMIT = 10
WINDOW_SECONDS = 60 * 60


def _key(user_id):
    return f"bulk-lesson-analysis:{user_id}"


def _hourly_limit():
    return max(
        1,
        int(
            getattr(
                settings,
                "BULK_LESSON_ANALYSIS_HOURLY_LIMIT",
                DEFAULT_HOURLY_LIMIT,
            )
        ),
    )


def check_bulk_lesson_analysis_throttle(user_id):
    """Allow a limited number of bulk analyses per teacher per hour."""
    limit = _hourly_limit()
    key = _key(user_id)
    cache.add(key, 0, WINDOW_SECONDS)
    try:
        count = cache.incr(key)
    except ValueError:
        cache.set(key, 1, WINDOW_SECONDS)
        count = 1

    if count > limit:
        raise Throttled(
            wait=WINDOW_SECONDS,
            detail=(
                "Bulk lesson analysis is limited to "
                f"{limit} requests per hour. Try again later."
            ),
        )
