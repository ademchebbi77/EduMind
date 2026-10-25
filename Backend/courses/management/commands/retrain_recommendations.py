from django.core.management.base import BaseCommand

from courses.ml_recommendations import train_recommender


class Command(BaseCommand):
    help = "Retrain and persist the local course recommendation model."

    def handle(self, *args, **options):
        state = train_recommender()
        self.stdout.write(
            self.style.SUCCESS(
                "Recommendation model trained: "
                f"{state['course_count']} courses, "
                f"{state['student_count']} students, "
                f"{state['enrollment_count']} enrollments."
            )
        )
