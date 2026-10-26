from io import StringIO

from django.core.files.base import ContentFile
from django.core.management import call_command
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase, override_settings

from accounts.models import User
from courses.demo_files import build_pdf
from courses.models import Course, Lesson

from .utils import TemporaryMediaMixin, create_course, pdf_upload


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class LegacyCourseMigrationTests(TemporaryMediaMixin, TransactionTestCase):
    migrate_from = [("courses", "0009_lesson_lessoncompletion_and_more")]
    migrate_to = [("courses", "0010_lesson_video_url_alter_lesson_file")]

    def setUp(self):
        super().setUp()
        self.teacher = User.objects.create_user(
            email="legacy-teacher@example.com",
            password="StrongPass123!",
            role=User.Role.TEACHER,
        )

        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        self.addCleanup(self._migrate_to_latest)

        legacy_apps = executor.loader.project_state(self.migrate_from).apps
        LegacyCourse = legacy_apps.get_model("courses", "Course")

        self.file_course = LegacyCourse(
            title="Cours existant",
            description="Résumé existant",
            owner_id=self.teacher.pk,
            type="pdf",
        )
        self.file_course.file.save(
            "legacy.pdf",
            ContentFile(build_pdf("Ancien cours", "Contenu existant")),
            save=False,
        )
        self.file_course.save()

        self.video_course = LegacyCourse(
            title="Cours vidéo existant",
            description="",
            owner_id=self.teacher.pk,
            type="video",
            video_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        )
        self.video_course.save()

        self.empty_course = LegacyCourse(
            title="Cours sans matériel",
            description="",
            owner_id=self.teacher.pk,
            type="",
        )
        self.empty_course.save()

        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_to)

    def _migrate_to_latest(self):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())

    def test_legacy_file_course_becomes_a_published_lesson(self):
        lesson = Lesson.objects.get(course_id=self.file_course.pk)

        self.assertEqual(lesson.title, "Cours existant")
        self.assertEqual(lesson.description, "Résumé existant")
        self.assertEqual(lesson.order, 1)
        self.assertTrue(lesson.is_published)
        self.assertEqual(lesson.file_type, Lesson.FileType.PDF)
        self.assertTrue(lesson.file)
        with lesson.file.storage.open(lesson.file.name, "rb") as handle:
            self.assertTrue(handle.read())

        course = Course.objects.get(pk=self.file_course.pk)
        self.assertTrue(course.file)
        self.assertNotEqual(course.file.name, lesson.file.name)

    def test_legacy_video_url_course_becomes_a_video_lesson(self):
        lesson = Lesson.objects.get(course_id=self.video_course.pk)

        self.assertEqual(lesson.title, "Cours vidéo existant")
        self.assertEqual(lesson.order, 1)
        self.assertTrue(lesson.is_published)
        self.assertEqual(lesson.file_type, Lesson.FileType.VIDEO)
        self.assertFalse(lesson.file)
        self.assertEqual(
            lesson.video_url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        )

        course = Course.objects.get(pk=self.video_course.pk)
        self.assertEqual(
            course.video_url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        )

    def test_legacy_course_without_material_gets_no_lesson(self):
        self.assertFalse(Lesson.objects.filter(course_id=self.empty_course.pk).exists())


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class MigrateCoursesCommandTests(TemporaryMediaMixin, TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            email="command-teacher@example.com",
            password="StrongPass123!",
            role=User.Role.TEACHER,
        )

    def test_command_creates_lessons_from_legacy_material(self):
        file_course = create_course(self.teacher, title="Cours fichier")
        video_course = Course.objects.create(
            title="Cours vidéo",
            owner=self.teacher,
            video_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        )
        empty_course = Course.objects.create(
            title="Cours vide", owner=self.teacher
        )

        stdout = StringIO()
        call_command("migrate_courses_to_lessons", stdout=stdout)

        file_lesson = Lesson.objects.get(course=file_course)
        self.assertEqual(file_lesson.title, "Cours fichier")
        self.assertEqual(file_lesson.file_type, Lesson.FileType.PDF)
        self.assertTrue(file_lesson.file)
        self.assertNotEqual(file_lesson.file.name, file_course.file.name)

        video_lesson = Lesson.objects.get(course=video_course)
        self.assertEqual(video_lesson.file_type, Lesson.FileType.VIDEO)
        self.assertFalse(video_lesson.file)
        self.assertEqual(
            video_lesson.video_url,
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        )

        self.assertFalse(Lesson.objects.filter(course=empty_course).exists())
        self.assertIn("2 lesson(s) created, 1 course(s) skipped.", stdout.getvalue())

    def test_command_skips_courses_that_already_have_lessons(self):
        course = create_course(self.teacher, title="Déjà migré")
        Lesson(
            course=course,
            title="Existante",
            order=1,
            file=pdf_upload(),
        ).save()

        call_command("migrate_courses_to_lessons", stdout=StringIO())

        self.assertEqual(course.lessons.count(), 1)
        self.assertEqual(course.lessons.get().title, "Existante")
