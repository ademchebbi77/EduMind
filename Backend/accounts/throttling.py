import hashlib

from django.conf import settings
from django.core.cache import cache


def _client_ip(request) -> str:
    if request is None:
        return "unknown"
    return request.META.get("REMOTE_ADDR", "unknown")


def _throttle_key(request, email: str) -> str:
    digest = hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()[:24]
    return f"login-fail:{_client_ip(request)}:{digest}"


def is_login_throttled(request, email: str) -> bool:
    return cache.get(_throttle_key(request, email), 0) >= settings.LOGIN_THROTTLE_ATTEMPTS


def record_login_failure(request, email: str) -> None:
    key = _throttle_key(request, email)
    cache.add(key, 0, settings.LOGIN_THROTTLE_WINDOW_SECONDS)
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, settings.LOGIN_THROTTLE_WINDOW_SECONDS)


def clear_login_failures(request, email: str) -> None:
    cache.delete(_throttle_key(request, email))
