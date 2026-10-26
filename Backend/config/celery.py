"""Celery application: runs long jobs (such as quiz generation) outside the HTTP request.

Start a worker with:  celery -A config worker --pool=solo --loglevel=info
(``--pool=solo`` is required on Windows.)
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("config")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
