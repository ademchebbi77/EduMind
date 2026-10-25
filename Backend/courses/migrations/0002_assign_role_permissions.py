from django.db import migrations

ROLE_PERMISSIONS = {
    "student": ("view_course",),
    "teacher": (
        "view_course",
        "add_course",
        "change_course",
        "delete_course",
    ),
    "admin": (
        "view_course",
        "add_course",
        "change_course",
        "delete_course",
    ),
}


def _course_permissions(apps):
    Permission = apps.get_model("auth", "Permission")
    ContentType = apps.get_model("contenttypes", "ContentType")
    content_type = ContentType.objects.filter(
        app_label="courses",
        model="course",
    ).first()
    if content_type is None:
        return Permission.objects.none()
    return Permission.objects.filter(content_type=content_type)


def assign_role_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    permissions = _course_permissions(apps)

    for role, codenames in ROLE_PERMISSIONS.items():
        group, _ = Group.objects.get_or_create(name=role)
        group.permissions.add(*permissions.filter(codename__in=codenames))


def remove_role_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    permissions = _course_permissions(apps)

    for role, codenames in ROLE_PERMISSIONS.items():
        group = Group.objects.filter(name=role).first()
        if group:
            group.permissions.remove(*permissions.filter(codename__in=codenames))


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_create_role_groups"),
        ("courses", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(assign_role_permissions, remove_role_permissions),
    ]
