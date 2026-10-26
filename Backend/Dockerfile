# EduMind API: Django + Gunicorn (also used for the Celery worker).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10

WORKDIR /app

# CPU-only PyTorch for the local Whisper model (avoids ~2 GB of CUDA libraries).
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch

COPY requirements.txt .
RUN pip install -r requirements.txt gunicorn==23.0.0

COPY . .

# Windows checkouts may add CR characters to the shell script.
RUN sed -i 's/\r$//' docker-entrypoint.sh \
    && chmod +x docker-entrypoint.sh \
    && useradd --create-home --uid 1000 edumind \
    && mkdir -p /app/media /app/staticfiles /home/edumind/.cache \
    && chown -R edumind:edumind /app /home/edumind/.cache

USER edumind
EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/config/', timeout=4)" || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "180", "--access-logfile", "-"]
