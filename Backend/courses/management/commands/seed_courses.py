from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User
from courses.demo_catalog import (
    DEMO_CATALOG,
    DEMO_CATEGORIES,
    DEMO_ENROLLMENTS,
    EXISTING_DEMO_COURSES,
)
from courses.demo_files import build_document_pdf, build_thumbnail
from courses.models import Category, Course, Enrollment, Lesson

DEFAULT_OWNER = "teacher@edumind.local"
DEFAULT_STUDENT = "student@edumind.local"


class Command(BaseCommand):
    help = (
        "Create demo categories and courses with lessons, PDFs and thumbnails. "
        "Safe to run several times: existing courses are kept."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--owner",
            help=f"Email of the teacher who owns the courses (default: {DEFAULT_OWNER}, "
            "else the first teacher).",
        )
        parser.add_argument(
            "--student",
            default=DEFAULT_STUDENT,
            help="Email of the student enrolled in a few demo courses (skipped if missing).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        owner = self._owner(options["owner"])
        colors = {spec["name"]: spec["color"] for spec in DEMO_CATEGORIES}

        categories = {}
        for spec in DEMO_CATEGORIES:
            category, _ = Category.objects.get_or_create(
                name=spec["name"], defaults={"description": spec["description"]}
            )
            categories[spec["name"]] = category

        # Courses created by seed_demo get a category, a level and tags.
        for title, meta in EXISTING_DEMO_COURSES.items():
            course = Course.objects.filter(title=title).first()
            if course is None:
                continue
            course.category = course.category or categories[meta["category"]]
            course.difficulty = course.difficulty or meta["difficulty"]
            course.tags = course.tags or meta["tags"]
            if not course.thumbnail:
                self._save_thumbnail(course, meta["category"], colors[meta["category"]])
            course.save()

        created = 0
        for spec in DEMO_CATALOG:
            if Course.objects.filter(title=spec["title"]).exists():
                continue
            self._create_course(spec, owner, categories[spec["category"]], colors[spec["category"]])
            created += 1

        enrolled = self._enroll_student(options["student"])

        self.stdout.write(
            self.style.SUCCESS(
                f"{len(DEMO_CATEGORIES)} categories, {created} new course(s) "
                f"({len(DEMO_CATALOG) - created} already present), "
                f"{enrolled} new enrollment(s)."
            )
        )

    def _owner(self, email):
        if email:
            owner = User.objects.filter(email__iexact=email).first()
            if owner is None:
                raise CommandError(f"No user with the email {email}.")
            return owner
        owner = (
            User.objects.filter(email=DEFAULT_OWNER).first()
            or User.objects.filter(role=User.Role.TEACHER, is_active=True).order_by("pk").first()
        )
        if owner is None:
            raise CommandError(
                "No teacher account found. Run seed_demo first or pass --owner <email>."
            )
        return owner

    def _create_course(self, spec, owner, category, color):
        course = Course(
            title=spec["title"],
            description=spec["description"],
            category=category,
            difficulty=spec["difficulty"],
            tags=spec["tags"],
            max_students=spec["max_students"],
            owner=owner,
        )
        # The full course PDF feeds the quiz generator, the summaries and the chat.
        course.file.save(
            "course.pdf",
            ContentFile(build_document_pdf(spec["title"], self._course_sections(spec))),
            save=False,
        )
        self._save_thumbnail(course, category.name, color)
        course.save()

        for order, lesson_spec in enumerate(spec["lessons"], start=1):
            lesson = Lesson(
                course=course,
                title=lesson_spec["title"],
                description=lesson_spec["sections"][0][1][0],
                order=order,
                duration_minutes=lesson_spec["duration_minutes"],
                is_published=True,
            )
            lesson.file.save(
                "lesson.pdf",
                ContentFile(build_document_pdf(lesson_spec["title"], lesson_spec["sections"])),
                save=False,
            )
            lesson.save()

    @staticmethod
    def _course_sections(spec):
        """Every lesson's sections, each heading prefixed with its lesson."""
        return [
            (f"{order}. {lesson['title']} : {heading}", paragraphs)
            for order, lesson in enumerate(spec["lessons"], start=1)
            for heading, paragraphs in lesson["sections"]
        ]

    @staticmethod
    def _save_thumbnail(course, label, color):
        course.thumbnail.save(
            "thumbnail.png",
            ContentFile(build_thumbnail(course.title, label, color)),
            save=False,
        )

    def _enroll_student(self, email):
        student = User.objects.filter(
            email__iexact=email, role=User.Role.STUDENT
        ).first()
        if student is None:
            return 0

        created_count = 0
        for title, completed_lessons in DEMO_ENROLLMENTS.items():
            course = Course.objects.filter(title=title).first()
            if course is None:
                continue
            _, created = Enrollment.objects.get_or_create(course=course, student=student)
            if not created:
                continue
            created_count += 1
            lessons = course.lessons.filter(is_published=True).order_by("order")
            for lesson in lessons[:completed_lessons]:
                lesson.mark_completed(student)
        return created_count
