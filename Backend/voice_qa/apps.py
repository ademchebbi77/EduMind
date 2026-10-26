from django.apps import AppConfig


class VoiceQaConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "voice_qa"
    verbose_name = "Voice questions and AI answers"

    def ready(self):
        from . import signals  # noqa: F401
