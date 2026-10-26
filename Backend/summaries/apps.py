from django.apps import AppConfig


class SummariesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "summaries"
    verbose_name = "Summaries and AI resources"

    def ready(self):
        from . import signals  # noqa: F401
