import logging

from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Exercise

logger = logging.getLogger(__name__)


@receiver(post_delete, sender=Exercise)
def delete_exercise_attachment(sender, instance, **kwargs):
    if not instance.attachment:
        return
    try:
        instance.attachment.delete(save=False)
    except Exception:
        logger.exception("Unable to delete the attachment of exercise %s", instance.pk)
