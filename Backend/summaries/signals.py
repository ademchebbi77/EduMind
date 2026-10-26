"""Delete stored files when a summary or a resource is deleted (also on course cascade)."""

import logging

from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Resource, Summary

logger = logging.getLogger(__name__)


def _delete_file(field_file, label):
    if not field_file:
        return
    try:
        field_file.delete(save=False)
    except Exception:
        logger.exception("Unable to delete the file of %s", label)


@receiver(post_delete, sender=Summary)
def delete_summary_illustration(sender, instance, **kwargs):
    _delete_file(instance.illustration, f"summary {instance.pk}")


@receiver(post_delete, sender=Resource)
def delete_resource_file(sender, instance, **kwargs):
    _delete_file(instance.file, f"resource {instance.pk}")
