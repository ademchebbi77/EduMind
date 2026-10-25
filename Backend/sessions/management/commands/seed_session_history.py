from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from accounts.models import User
from sessions.demo import seed_session_history
from sessions.forecast import forecast_upcoming
from sessions.models import LiveSession
from sessions.scheduling import best_time_slots


class Command(BaseCommand):
    help = "Crée un historique de sessions et de l'activité pour les analyses locales."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError(
                "seed_session_history est désactivé quand DEBUG=False. "
                "Il ne crée que des données de démonstration."
            )

        try:
            stats = seed_session_history()
        except RuntimeError as error:
            raise CommandError(str(error)) from error

        self.stdout.write(
            self.style.SUCCESS(
                f"{stats['sessions_total']} sessions de démonstration "
                f"({stats['sessions_created']} créées), "
                f"{stats['enrollments']} inscriptions."
            )
        )
        self.stdout.write(
            f"{stats['quiz_attempts']} tentative(s) de quiz et "
            f"{stats['submissions']} rendu(s) d'exercice ajoutés."
        )

        teacher = User.objects.filter(email="teacher@edumind.local").first()
        if teacher is not None:
            sessions = LiveSession.objects.filter(created_by=teacher)
            upcoming = forecast_upcoming(sessions, limit=3)
            if upcoming:
                self.stdout.write(self.style.SUCCESS("Prévisions de remplissage :"))
                for session, forecast in upcoming:
                    self.stdout.write(
                        f"  {session.title} — "
                        f"{forecast.expected_enrollments} inscrit(s) attendus "
                        f"(confiance {forecast.confidence_label.lower()})"
                    )

            slots = best_time_slots(
                sessions=sessions.filter(starts_at__lt=timezone.now())
            )
            if slots:
                self.stdout.write(self.style.SUCCESS("Meilleurs créneaux :"))
                for slot in slots:
                    self.stdout.write(
                        f"  {slot.weekday_label} {slot.hour:02d}h — "
                        f"{slot.average_enrollments} inscrit(s) en moyenne "
                        f"({slot.session_count} session(s))"
                    )
