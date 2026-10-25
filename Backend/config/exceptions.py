import logging

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404, JsonResponse
from rest_framework import exceptions
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def error_payload(code: str, message: str, fields=None) -> dict:
    error = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    return {"error": error}


def _normalize_fields(data):
    """Turn DRF validation data into JSON-friendly field -> messages mapping."""
    if isinstance(data, dict):
        return {str(key): _normalize_fields(value) for key, value in data.items()}
    if isinstance(data, (list, tuple)):
        # Nested serializers (many=True) report one dict per item.
        return [
            _normalize_fields(item) if isinstance(item, dict) else str(item)
            for item in data
        ]
    return [str(data)]


def api_exception_handler(exc, context):
    if isinstance(exc, Http404):
        exc = exceptions.NotFound(*(exc.args))
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied(*(exc.args))

    response = drf_exception_handler(exc, context)
    if response is None:
        # Unknown exceptions are handled by Django's 500 handler.
        return None

    fields = None
    if isinstance(exc, exceptions.ValidationError):
        code = "validation_error"
        message = "The submitted data is invalid."
        fields = _normalize_fields(response.data)
    elif isinstance(exc, exceptions.AuthenticationFailed):
        code = "invalid_credentials"
        message = str(exc.detail) if exc.detail else "Authentication failed."
    elif isinstance(exc, exceptions.NotAuthenticated):
        code = "authentication_required"
        message = "You must be signed in to access this resource."
    elif isinstance(exc, exceptions.PermissionDenied):
        code = "permission_denied"
        message = "You do not have permission to perform this action."
    elif isinstance(exc, exceptions.NotFound):
        code = "not_found"
        message = "The requested resource could not be found."
    elif isinstance(exc, exceptions.MethodNotAllowed):
        code = "method_not_allowed"
        message = "This HTTP method is not allowed on this resource."
    elif isinstance(exc, exceptions.Throttled):
        code = "throttled"
        if exc.wait:
            message = f"Too many attempts. Try again in {int(exc.wait)} seconds."
        else:
            message = "Too many attempts. Try again shortly."
    elif isinstance(exc, exceptions.ParseError):
        code = "parse_error"
        message = "The request body is invalid."
    elif isinstance(exc, exceptions.UnsupportedMediaType):
        code = "unsupported_media_type"
        message = "This content type is not supported."
    elif isinstance(exc, exceptions.NotAcceptable):
        code = "not_acceptable"
        message = "No acceptable response format was found."
    elif getattr(exc, "status_code", None) == 503:
        code = getattr(exc, "default_code", None) or "service_unavailable"
        detail = getattr(exc, "detail", None)
        message = (
            str(detail) if detail else "The service is temporarily unavailable."
        )
    else:
        code = "api_error"
        message = "An error occurred while processing the request."

    response.data = error_payload(code, message, fields)
    return response


def csrf_failure(request, reason=""):
    return JsonResponse(
        error_payload(
            "csrf_failed",
            "CSRF verification failed. Reload the page and try again.",
        ),
        status=403,
    )


def handler404(request, exception):
    return JsonResponse(
        error_payload("not_found", "The requested resource could not be found."),
        status=404,
    )


def handler500(request):
    logger.error("Unhandled server error on %s %s", request.method, request.path)
    return JsonResponse(
        error_payload("server_error", "An internal error occurred."),
        status=500,
    )
