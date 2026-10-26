"""Django settings for EduMind AI.

All environment-specific values are read from the root .env file or the
process environment. Secrets must never be committed to the repository.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent

load_dotenv(ROOT_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


def env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


SECRET_KEY = os.environ["SECRET_KEY"]
DEBUG = env_bool("DEBUG", False)
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "accounts",
    "courses",
    "assessments",
    "sessions",
    "announcements",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME", "edumind"),
        "USER": os.getenv("DB_USER", "edumind"),
        "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", "localhost"),
        "PORT": os.getenv("DB_PORT", "5432"),
        "CONN_MAX_AGE": 60,
    }
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-gb"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "http://localhost:5173")

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_HTTPONLY = False  # Axios must be able to read the token.
COOKIE_SECURE = env_bool("COOKIE_SECURE", False)
SESSION_COOKIE_SECURE = COOKIE_SECURE
CSRF_COOKIE_SECURE = COOKIE_SECURE

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
# "SAMEORIGIN" lets the app embed PDFs served by the authenticated file view.
X_FRAME_OPTIONS = "SAMEORIGIN"

MAX_UPLOAD_SIZE_MB = env_int("MAX_UPLOAD_SIZE_MB", 50)
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024

MAX_VIDEO_UPLOAD_SIZE_MB = env_int("MAX_VIDEO_UPLOAD_SIZE_MB", 500)
MAX_VIDEO_UPLOAD_SIZE_BYTES = MAX_VIDEO_UPLOAD_SIZE_MB * 1024 * 1024

AVATAR_MAX_SIZE_MB = env_int("AVATAR_MAX_SIZE_MB", 5)
AVATAR_MAX_SIZE_BYTES = AVATAR_MAX_SIZE_MB * 1024 * 1024

THUMBNAIL_MAX_SIZE_MB = env_int("THUMBNAIL_MAX_SIZE_MB", 2)
THUMBNAIL_MAX_SIZE_BYTES = THUMBNAIL_MAX_SIZE_MB * 1024 * 1024
THUMBNAIL_MAX_WIDTH = env_int("THUMBNAIL_MAX_WIDTH", 1920)
THUMBNAIL_MAX_HEIGHT = env_int("THUMBNAIL_MAX_HEIGHT", 1080)

# Course form auto-fill (local NLP, no external API)
CONTENT_ANALYZER_MAX_WORDS = env_int("CONTENT_ANALYZER_MAX_WORDS", 5000)
CONTENT_ANALYZER_PDF_PAGES = env_int("CONTENT_ANALYZER_PDF_PAGES", 5)
CONTENT_ANALYZER_MEDIA_SECONDS = env_int("CONTENT_ANALYZER_MEDIA_SECONDS", 180)
CONTENT_ANALYZER_WHISPER_MODEL = os.getenv(
    "CONTENT_ANALYZER_WHISPER_MODEL", "tiny"
)
CONTENT_ANALYZER_LANGUAGE = os.getenv("CONTENT_ANALYZER_LANGUAGE", "")
CONTENT_ANALYZER_FFMPEG_TIMEOUT_SECONDS = env_int(
    "CONTENT_ANALYZER_FFMPEG_TIMEOUT_SECONDS", 300
)

# Course video transcripts (Cohere)
COHERE_API_KEY = os.getenv("COHERE_API_KEY", "")
COHERE_TRANSCRIBE_MODEL = os.getenv(
    "COHERE_TRANSCRIBE_MODEL", "cohere-transcribe-03-2026"
)
COHERE_CHAT_MODEL = os.getenv("COHERE_CHAT_MODEL", "command-a-03-2025")
COHERE_TRANSCRIPT_LANGUAGE = os.getenv("COHERE_TRANSCRIPT_LANGUAGE", "en")
COHERE_TRANSCRIPT_SECTION_CHARS = env_int(
    "COHERE_TRANSCRIPT_SECTION_CHARS", 12000
)
TRANSCRIPT_CHUNK_SECONDS = env_int("TRANSCRIPT_CHUNK_SECONDS", 120)
TRANSCRIPT_FFMPEG_TIMEOUT_SECONDS = env_int(
    "TRANSCRIPT_FFMPEG_TIMEOUT_SECONDS", 900
)
TRANSCRIPT_STALE_MINUTES = env_int("TRANSCRIPT_STALE_MINUTES", 30)

# Course recommendations (local scikit-learn, no external services)
RECOMMENDATION_MODEL_PATH = os.getenv("RECOMMENDATION_MODEL_PATH") or str(
    BASE_DIR / "ml_models" / "recommendations.pkl"
)
RECOMMENDATION_RETRAIN_DAYS = env_int("RECOMMENDATION_RETRAIN_DAYS", 7)
RECOMMENDATION_CACHE_TIMEOUT = env_int(
    "RECOMMENDATION_CACHE_TIMEOUT", 60 * 60 * 24 * 7
)
RECOMMENDATION_AUTO_RETRAIN = env_bool("RECOMMENDATION_AUTO_RETRAIN", True)

# Background jobs (Celery + Redis). Set CELERY_TASK_ALWAYS_EAGER=True to run
# jobs inside the web process when no Redis/worker is available (local dev only).
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
CELERY_TASK_ALWAYS_EAGER = env_bool("CELERY_TASK_ALWAYS_EAGER", False)
CELERY_TASK_IGNORE_RESULT = True
CELERY_TASK_ACKS_LATE = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_SOFT_TIME_LIMIT = env_int("CELERY_TASK_SOFT_TIME_LIMIT", 120)
CELERY_TASK_TIME_LIMIT = env_int("CELERY_TASK_TIME_LIMIT", 180)
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_BROKER_TRANSPORT_OPTIONS = {"socket_connect_timeout": 3}

# Local quiz generator (no external AI service).
QUIZ_GENERATION_MAX_ACTIVE_JOBS = env_int("QUIZ_GENERATION_MAX_ACTIVE_JOBS", 3)
QUIZ_GENERATION_STALE_MINUTES = env_int("QUIZ_GENERATION_STALE_MINUTES", 10)

FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

LOGIN_THROTTLE_ATTEMPTS = env_int("LOGIN_THROTTLE_ATTEMPTS", 5)
LOGIN_THROTTLE_WINDOW_SECONDS = env_int("LOGIN_THROTTLE_WINDOW_SECONDS", 60)

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "edumind-default",
    }
}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "config.authentication.SessionAuthentication401",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "config.pagination.StandardResultsSetPagination",
    "PAGE_SIZE": 12,
    "EXCEPTION_HANDLER": "config.exceptions.api_exception_handler",
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ],
}

CSRF_FAILURE_VIEW = "config.exceptions.csrf_failure"
