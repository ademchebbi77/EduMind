import logging

from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Course

logger = logging.getLogger(__name__)


@receiver(post_delete, sender=Course)
def delete_course_file(sender, instance, **kwargs):
    if not instance.file:
        return
    try:
        instance.file.delete(save=False)
    except Exception:
        logger.exception("Impossible de supprimer le fichier du cours %s", instance.pk)
