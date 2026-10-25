from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from announcements.demo import seed_announcements


class Command(BaseCommand):
    help = "Create demo announcements covering every urgency level."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError(
                "seed_announcements is disabled when DEBUG=False. "
                "It only creates demo data for local development."
            )

        try:
            total, created, enrollments, scored = seed_announcements()
        except RuntimeError as error:
            raise CommandError(str(error)) from error

        self.stdout.write(
            self.style.SUCCESS(
                f"{total} demo announcements ready "
                f"({created} created, {enrollments} enrollments)."
            )
        )
        self.stdout.write("")
        self.stdout.write(f"{'Score':>5}  {'Niveau':<10}  Annonce")
        for announcement, urgency in scored:
            self.stdout.write(
                f"{urgency.score:>5}  {urgency.label:<10}  {announcement.title}"
            )
        self.stdout.write("")
        self.stdout.write(
            self.style.WARNING(
                "Les scores sont calculés à la lecture : ils évoluent avec la date "
                "de l'événement et le nombre d'inscriptions confirmées."
            )
        )
