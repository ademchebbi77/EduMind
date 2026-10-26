"""Start the background services automatically with ``manage.py runserver`` (development).

With ``AUTO_START_BACKGROUND_SERVICES`` on (the default when DEBUG=True):

1. Redis: if nothing answers on the broker port, start (or create) the
   ``edumind-redis`` Docker container.
2. Celery: start a worker next to the development server. It runs in Django's
   reloaded process, so it is restarted with fresh code on every reload.
3. No Redis available (Docker missing or stopped): run background jobs inside the
   web process instead (CELERY_TASK_ALWAYS_EAGER), so every feature still works.

Nothing happens for other commands (tests, migrate, celery itself) or in production.
"""

import atexit
import logging
import os
import shutil
import socket
import subprocess
import sys
import time
from urllib.parse import urlparse

from django.conf import settings

logger = logging.getLogger(__name__)

REDIS_CONTAINER = "edumind-redis"
REDIS_IMAGE = "redis:7-alpine"
_worker = None


def _say(message):
    # Printed (not logged) so it shows in the runserver console like Django's own lines.
    print(f"[EduMind] {message}", flush=True)


def should_start(argv=None, environ=None):
    argv = sys.argv if argv is None else argv
    environ = os.environ if environ is None else environ
    if not getattr(settings, "AUTO_START_BACKGROUND_SERVICES", False):
        return False
    if len(argv) < 2 or argv[1] != "runserver":
        return False
    # With the autoreloader, Django runs the server in a child process flagged
    # RUN_MAIN; the parent only watches files. Start services in the child only.
    return environ.get("RUN_MAIN") == "true" or "--noreload" in argv


def _broker_address():
    url = urlparse(settings.CELERY_BROKER_URL)
    return url.hostname or "127.0.0.1", url.port or 6379


def broker_reachable(timeout=0.5):
    host, port = _broker_address()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _docker(*args, timeout=60):
    return subprocess.run(
        ["docker", *args], capture_output=True, text=True, timeout=timeout
    )


def start_redis():
    """Start the Redis container with Docker. Returns True when Redis answers."""
    if broker_reachable():
        return True
    if shutil.which("docker") is None:
        _say("Docker is not installed: Redis cannot be started automatically.")
        return False
    try:
        if _docker("info", timeout=20).returncode != 0:
            _say("Docker Desktop is not running: start it to use Redis.")
            return False
        _say("Starting Redis (Docker container edumind-redis)…")
        result = _docker("start", REDIS_CONTAINER)
        if result.returncode != 0:  # first run: create the container
            _, port = _broker_address()
            result = _docker(
                "run", "-d", "--name", REDIS_CONTAINER, "-p", f"{port}:6379", REDIS_IMAGE,
                timeout=300,
            )
        if result.returncode != 0:
            _say(f"Redis could not be started: {result.stderr.strip()[:200]}")
            return False
    except (OSError, subprocess.TimeoutExpired) as error:
        _say(f"Redis could not be started: {error}")
        return False

    for _ in range(40):
        if broker_reachable():
            _say("Redis is ready.")
            return True
        time.sleep(0.25)
    _say("Redis did not answer in time.")
    return False


def start_worker():
    global _worker
    environment = {**os.environ, "PYTHONUTF8": "1"}
    environment.pop("RUN_MAIN", None)
    _worker = subprocess.Popen(
        [sys.executable, "-m", "celery", "-A", "config", "worker", "--pool=solo", "--loglevel=warning"],
        cwd=str(settings.BASE_DIR),
        env=environment,
    )
    atexit.register(stop_worker)
    _say(f"Celery worker started (pid {_worker.pid}) — quiz generation and voice questions are ready.")


def stop_worker():
    global _worker
    if _worker is None or _worker.poll() is not None:
        return
    _worker.terminate()
    try:
        _worker.wait(timeout=10)
    except subprocess.TimeoutExpired:
        _worker.kill()
    _worker = None


def use_inline_jobs():
    from config.celery import app

    app.conf.update(CELERY_TASK_ALWAYS_EAGER=True)
    _say(
        "Background jobs run inside the web server (no Redis). Everything works, "
        "but long AI tasks make pages wait."
    )


def start():
    """Entry point called when Django is ready."""
    if not should_start():
        return
    if settings.CELERY_TASK_ALWAYS_EAGER:
        return  # already configured to run jobs inline: nothing to start
    if start_redis():
        start_worker()
    else:
        use_inline_jobs()
