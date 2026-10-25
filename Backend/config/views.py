from django.conf import settings
from django.http import JsonResponse
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.validators import ALLOWED_AVATAR_EXTENSIONS
from config.exceptions import error_payload
from courses.validators import (
    ALLOWED_EXTENSIONS,
    AUDIO_EXTENSIONS,
    PDF_EXTENSIONS,
    THUMBNAIL_EXTENSIONS,
    VIDEO_EXTENSIONS,
)


class ApiConfigView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response(
            {
                "max_upload_size_mb": settings.MAX_UPLOAD_SIZE_MB,
                "max_upload_size_bytes": settings.MAX_UPLOAD_SIZE_BYTES,
                "max_video_upload_size_mb": settings.MAX_VIDEO_UPLOAD_SIZE_MB,
                "max_video_upload_size_bytes": settings.MAX_VIDEO_UPLOAD_SIZE_BYTES,
                "allowed_extensions": list(ALLOWED_EXTENSIONS),
                "pdf_extensions": list(PDF_EXTENSIONS),
                "audio_extensions": list(AUDIO_EXTENSIONS),
                "video_extensions": list(VIDEO_EXTENSIONS),
                "thumbnail_extensions": list(THUMBNAIL_EXTENSIONS),
                "thumbnail_max_size_mb": settings.THUMBNAIL_MAX_SIZE_MB,
                "thumbnail_max_size_bytes": settings.THUMBNAIL_MAX_SIZE_BYTES,
                "thumbnail_max_width": settings.THUMBNAIL_MAX_WIDTH,
                "thumbnail_max_height": settings.THUMBNAIL_MAX_HEIGHT,
                "avatar_max_size_mb": settings.AVATAR_MAX_SIZE_MB,
                "avatar_max_size_bytes": settings.AVATAR_MAX_SIZE_BYTES,
                "avatar_extensions": list(ALLOWED_AVATAR_EXTENSIONS),
            }
        )


def api_not_found(request, *args, **kwargs):
    return JsonResponse(
        error_payload("not_found", "The requested resource could not be found."),
        status=404,
    )
