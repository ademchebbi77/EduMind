from django.contrib.auth.models import Group
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import User


@receiver(post_save, sender=User)
def sync_role_group(sender, instance, **kwargs):
    """Keep the user's role group in sync with the role field."""
    role_names = [choice.value for choice in sender.Role]
    group, _ = Group.objects.get_or_create(name=instance.role)
    stale_groups = instance.groups.filter(name__in=role_names).exclude(pk=group.pk)
    if stale_groups.exists():
        instance.groups.remove(*stale_groups)
    if not instance.groups.filter(pk=group.pk).exists():
        instance.groups.add(group)
