import logging

from django.db.models import F, Value
from django.db.models.functions import Greatest
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Course, Enrollment, Lesson

logger = logging.getLogger(__name__)


@receiver(post_delete, sender=Course)
def delete_course_file(sender, instance, **kwargs):
    for field_file in (instance.file, instance.thumbnail):
        if not field_file:
            continue
        try:
            field_file.delete(save=False)
        except Exception:
            logger.exception(
                "Impossible de supprimer un fichier du cours %s", instance.pk
            )


@receiver(post_delete, sender=Lesson)
def delete_lesson_file(sender, instance, **kwargs):
    if instance.file:
        try:
            instance.file.delete(save=False)
        except Exception:
            logger.exception(
                "Unable to delete the file of lesson %s", instance.pk
            )

    course = Course.objects.filter(pk=instance.course_id).first()
    if course is not None:
        course.sync_type_from_lessons()


@receiver(post_save, sender=Enrollment)
def increment_course_enrolled_count(sender, instance, created, **kwargs):
    if not created:
        return
    Course.objects.filter(pk=instance.course_id).update(
        enrolled_count=F("enrolled_count") + 1
    )


@receiver(post_delete, sender=Enrollment)
def decrement_course_enrolled_count(sender, instance, **kwargs):
    Course.objects.filter(pk=instance.course_id).update(
        enrolled_count=Greatest(F("enrolled_count") - 1, Value(0))
    )
