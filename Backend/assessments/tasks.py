from celery import shared_task

from .generation.service import run_job


@shared_task(name="assessments.generate_quiz")
def generate_quiz_task(job_id):
    run_job(job_id)
