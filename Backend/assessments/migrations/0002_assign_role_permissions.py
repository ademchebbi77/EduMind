from django.db import migrations

MODELS = ("quiz", "question", "answeroption", "exercise")
MANAGER_ACTIONS = ("view", "add", "change", "delete")

ROLE_PERMISSIONS = {
    "student": tuple(f"view_{model}" for model in ("quiz", "exercise"))
    + ("add_quizattempt", "view_quizattempt", "add_exercisesubmission", "change_exercisesubmission"),
    "teacher": tuple(f"{action}_{model}" for model in MODELS for action in MANAGER_ACTIONS)
    + ("view_quizattempt", "view_exercisesubmission", "change_exercisesubmission"),
    "admin": tuple(f"{action}_{model}" for model in MODELS for action in MANAGER_ACTIONS)
    + ("view_quizattempt", "view_exercisesubmission", "change_exercisesubmission"),
}


def _assessment_permissions(apps):
    Permission = apps.get_model("auth", "Permission")
    return Permission.objects.filter(content_type__app_label="assessments")


def _ensure_permissions(apps):
    # Permissions are normally created by a post_migrate signal, which runs
    # after all migrations; create them now so they can be assigned.
    from django.contrib.auth.management import create_permissions

    app_config = apps.get_app_config("assessments")
    app_config.models_module = True
    create_permissions(app_config, apps=apps, verbosity=0)
    app_config.models_module = None


def assign_role_permissions(apps, schema_editor):
    _ensure_permissions(apps)
    Group = apps.get_model("auth", "Group")
    permissions = _assessment_permissions(apps)

    for role, codenames in ROLE_PERMISSIONS.items():
        group, _ = Group.objects.get_or_create(name=role)
        group.permissions.add(*permissions.filter(codename__in=codenames))


def remove_role_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    permissions = _assessment_permissions(apps)

    for role, codenames in ROLE_PERMISSIONS.items():
        group = Group.objects.filter(name=role).first()
        if group:
            group.permissions.remove(*permissions.filter(codename__in=codenames))


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_create_role_groups"),
        ("assessments", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(assign_role_permissions, remove_role_permissions),
    ]
