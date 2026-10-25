from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.core.files.base import ContentFile

from accounts.models import User
from courses.demo_files import build_pdf, build_wav
from courses.models import Course

DEMO_PASSWORD = "EduMind!2026"

DEMO_USERS = (
    {
        "email": "admin@edumind.local",
        "first_name": "Admin",
        "last_name": "EduMind",
        "role": User.Role.ADMIN,
        "is_staff": True,
        "is_superuser": True,
    },
    {
        "email": "teacher@edumind.local",
        "first_name": "Thomas",
        "last_name": "Enseignant",
        "role": User.Role.TEACHER,
        "is_staff": False,
        "is_superuser": False,
    },
    {
        "email": "student@edumind.local",
        "first_name": "Sofia",
        "last_name": "Étudiante",
        "role": User.Role.STUDENT,
        "is_staff": False,
        "is_superuser": False,
    },
)

DEMO_COURSES = (
    {
        "title": "Introduction à l'apprentissage automatique",
        "description": (
            "Découvrez les fondements de l'apprentissage supervisé et non supervisé, "
            "avec des exemples concrets et un guide de démarrage."
        ),
        "kind": "pdf",
        "filename": "introduction-machine-learning.pdf",
    },
    {
        "title": "Python pour l'intelligence artificielle",
        "description": (
            "Un support de cours pour maîtriser les bases de Python appliquées "
            "aux projets d'intelligence artificielle."
        ),
        "kind": "pdf",
        "filename": "python-intelligence-artificielle.pdf",
    },
    {
        "title": "Podcast : l'IA dans l'éducation",
        "description": (
            "Un épisode audio consacré aux usages responsables de l'IA en classe "
            "et aux bénéfices pour les apprenants."
        ),
        "kind": "audio",
        "filename": "podcast-ia-education.wav",
        "frequency": 330.0,
    },
    {
        "title": "Les réseaux de neurones expliqués",
        "description": (
            "Une introduction audio aux réseaux de neurones, aux couches et "
            "à la rétropropagation du gradient."
        ),
        "kind": "audio",
        "filename": "reseaux-neurones.wav",
        "frequency": 440.0,
    },
)


class Command(BaseCommand):
    help = "Create demo accounts and sample courses for local development."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError(
                "seed_demo is disabled when DEBUG=False. "
                "It only creates demo accounts for local development."
            )

        for spec in DEMO_USERS:
            user, created = User.objects.update_or_create(
                email=spec["email"],
                defaults={
                    "first_name": spec["first_name"],
                    "last_name": spec["last_name"],
                    "role": spec["role"],
                    "is_staff": spec["is_staff"],
                    "is_superuser": spec["is_superuser"],
                    "is_active": True,
                },
            )
            user.set_password(DEMO_PASSWORD)
            user.save()
            action = "created" if created else "updated"
            self.stdout.write(f"  {user.email} ({user.role}) {action}")

        teacher = User.objects.get(email="teacher@edumind.local")
        created_courses = 0
        for spec in DEMO_COURSES:
            course = Course.objects.filter(title=spec["title"]).first()
            file_missing = (
                course is None
                or not course.file
                or not course.file.storage.exists(course.file.name)
            )
            if course is None:
                course = Course(
                    title=spec["title"],
                    description=spec["description"],
                    owner=teacher,
                )
            if file_missing:
                if spec["kind"] == "pdf":
                    content = build_pdf(spec["title"], spec["description"])
                else:
                    content = build_wav(frequency=spec["frequency"])
                course.file.save(
                    spec["filename"],
                    ContentFile(content),
                    save=False,
                )
                course.save()
                created_courses += 1

        self.stdout.write(self.style.SUCCESS("Demo accounts ready:"))
        self.stdout.write("  Administrator : admin@edumind.local / EduMind!2026")
        self.stdout.write("  Teacher       : teacher@edumind.local / EduMind!2026")
        self.stdout.write("  Student       : student@edumind.local / EduMind!2026")
        self.stdout.write(
            self.style.SUCCESS(
                f"{len(DEMO_COURSES)} demo courses available "
                f"({created_courses} file(s) generated)."
            )
        )
        self.stdout.write(
            self.style.WARNING(
                "These credentials are reserved for local demonstrations."
            )
        )
