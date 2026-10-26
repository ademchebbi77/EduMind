from django.apps import AppConfig


class AssessmentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "assessments"
    verbose_name = "Quizzes and exercises"

    def ready(self):
        from . import signals  # noqa: F401

        # Development convenience: `manage.py runserver` also brings up Redis and a
        # Celery worker (see config/dev_services.py).
        from config import dev_services

        dev_services.start()
