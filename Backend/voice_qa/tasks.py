from celery import shared_task

from .jobs import run_answer, run_transcription


# Local Whisper runs on the CPU (and loads its model on first use): allow more time.
@shared_task(name="voice_qa.transcribe", soft_time_limit=300, time_limit=360)
def transcribe_question_task(question_id):
    run_transcription(question_id)


@shared_task(name="voice_qa.answer")
def answer_question_task(question_id):
    run_answer(question_id)
