from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from courses.models import Course, Lesson


class Command(BaseCommand):
    help = (
        "Create one lesson per single-material course so existing courses "
        "work with the sequential lesson system. The legacy course file and "
        "video URL are kept for backward compatibility."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--course-ids",
            nargs="+",
            type=int,
            help="Migrate only these course IDs.",
        )

    def handle(self, *args, **options):
        courses = Course.objects.all()
        if options["course_ids"]:
            courses = courses.filter(pk__in=options["course_ids"])

        created = 0
        skipped = 0
        for course in courses.iterator():
            if course.lessons.exists():
                skipped += 1
                continue
            if not course.file and not course.video_url:
                skipped += 1
                continue

            lesson = Lesson(
                course=course,
                title=course.title,
                description=course.description,
                order=1,
                duration_minutes=None,
                is_published=True,
            )
            if course.file:
                source = course.file
                try:
                    with source.open("rb") as handle:
                        lesson.file.save(
                            source.name,
                            ContentFile(handle.read()),
                            save=False,
                        )
                except (FileNotFoundError, OSError) as error:
                    self.stderr.write(
                        self.style.WARNING(
                            f"Course {course.pk}: unable to copy the file "
                            f"({error}); skipped."
                        )
                    )
                    skipped += 1
                    continue
            else:
                lesson.video_url = course.video_url

            lesson.save()
            created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"{created} lesson(s) created, {skipped} course(s) skipped."
            )
        )
