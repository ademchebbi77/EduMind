import logging

from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import VoiceQuestion

logger = logging.getLogger(__name__)


@receiver(post_delete, sender=VoiceQuestion)
def delete_question_audio(sender, instance, **kwargs):
    if not instance.audio:
        return
    try:
        instance.audio.delete(save=False)
    except Exception:
        logger.exception("Unable to delete the audio of voice question %s", instance.pk)
