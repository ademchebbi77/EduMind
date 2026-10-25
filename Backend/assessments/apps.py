from django.apps import AppConfig


class AssessmentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "assessments"
    verbose_name = "Quizzes and exercises"

    def ready(self):
        from . import signals  # noqa: F401
