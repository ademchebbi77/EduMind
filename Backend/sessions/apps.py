from django.apps import AppConfig


class LiveSessionsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "sessions"
    label = "live_sessions"
    verbose_name = "Sessions en ligne"
