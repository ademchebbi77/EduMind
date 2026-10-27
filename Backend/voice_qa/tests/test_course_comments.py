from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from courses.models import Course
from voice_qa.models import CourseComment

URL = "/api/voice-questions/comments/"


def detail_url(comment):
    return f"{URL}{comment.pk}/"


def reply_url(comment):
    return f"{URL}{comment.pk}/reply/"


class CourseCommentApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        make = User.objects.create_user
        self.teacher = make(email="teacher@example.com", password="x", role=User.Role.TEACHER)
        self.other_teacher = make(email="other@example.com", password="x", role=User.Role.TEACHER)
        self.admin = make(email="admin@example.com", password="x", role=User.Role.ADMIN)
        self.student = make(
            email="sofia@example.com", password="x", role=User.Role.STUDENT,
            first_name="Sofia", last_name="Ben Ali",
        )
        self.classmate = make(email="amine@example.com", password="x", role=User.Role.STUDENT)
        self.course = Course.objects.create(title="SQL", owner=self.teacher)
        self.other_course = Course.objects.create(title="React", owner=self.other_teacher)

    def comment(self, author=None, course=None, text="Great course!", **extra):
        return CourseComment.objects.create(
            author=author or self.student, course=course or self.course, text=text, **extra
        )

    # Create
    def test_student_can_comment_on_a_course(self):
        self.client.force_authenticate(self.student)

        response = self.client.post(
            URL, {"course": self.course.pk, "text": "  Very clear, thanks!  "}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        body = response.json()
        self.assertEqual(body["text"], "Very clear, thanks!")
        self.assertEqual(body["author_name"], "Sofia Ben Ali")
        self.assertTrue(body["is_mine"])
        self.assertTrue(body["can_edit"])
        self.assertFalse(body["can_reply"])
        self.assertEqual(CourseComment.objects.get().author, self.student)

    def test_teachers_and_admins_cannot_post_comments(self):
        for user in (self.teacher, self.admin):
            with self.subTest(user=user.email):
                self.client.force_authenticate(user)
                response = self.client.post(
                    URL, {"course": self.course.pk, "text": "Hello"}, format="json"
                )
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(CourseComment.objects.exists())

    def test_comment_validation(self):
        self.client.force_authenticate(self.student)
        cases = (
            ({"course": self.course.pk, "text": "   "}, "text"),
            ({"course": self.course.pk, "text": "x" * 2001}, "text"),
            ({"course": 999999, "text": "Hello"}, "course"),
            ({"text": "Hello"}, "course"),
        )
        for payload, field in cases:
            with self.subTest(field=field, payload=str(payload)[:40]):
                response = self.client.post(URL, payload, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.json()["error"]["fields"])

    def test_anonymous_users_are_rejected(self):
        response = self.client.get(URL, {"course": self.course.pk})
        self.assertIn(response.status_code, (401, 403))

    # Read
    def test_everyone_signed_in_reads_the_comments_of_a_course(self):
        self.comment()
        self.comment(author=self.classmate, text="Me too")
        self.comment(course=self.other_course, text="Elsewhere")

        for user in (self.classmate, self.other_teacher):
            with self.subTest(user=user.email):
                self.client.force_authenticate(user)
                response = self.client.get(URL, {"course": self.course.pk})
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.json()["count"], 2)

    def test_default_list_depends_on_the_role(self):
        mine = self.comment()
        on_my_course = self.comment(author=self.classmate)
        elsewhere = self.comment(course=self.other_course)

        expectations = (
            (self.student, {mine.pk, elsewhere.pk}),
            (self.teacher, {mine.pk, on_my_course.pk}),
            (self.admin, {mine.pk, on_my_course.pk, elsewhere.pk}),
        )
        for user, expected in expectations:
            with self.subTest(user=user.email):
                self.client.force_authenticate(user)
                results = self.client.get(URL).json()["results"]
                self.assertEqual({item["id"] for item in results}, expected)

    def test_unanswered_filter_and_invalid_course(self):
        self.comment(reply="Thanks!", replied_by=self.teacher)
        waiting = self.comment(text="Question?")
        self.client.force_authenticate(self.teacher)

        results = self.client.get(URL, {"unanswered": "1"}).json()["results"]
        self.assertEqual([item["id"] for item in results], [waiting.pk])

        response = self.client.get(URL, {"course": "abc"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # Update
    def test_author_can_edit_their_comment(self):
        comment = self.comment()
        self.client.force_authenticate(self.student)

        response = self.client.patch(detail_url(comment), {"text": "Updated"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        comment.refresh_from_db()
        self.assertEqual(comment.text, "Updated")
        self.assertIsNotNone(comment.edited_at)

    def test_nobody_else_can_edit_a_comment(self):
        comment = self.comment()
        for user in (self.classmate, self.teacher, self.admin):
            with self.subTest(user=user.email):
                self.client.force_authenticate(user)
                response = self.client.patch(detail_url(comment), {"text": "Hacked"}, format="json")
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        comment.refresh_from_db()
        self.assertEqual(comment.text, "Great course!")

    def test_a_comment_cannot_move_to_another_course_or_use_put(self):
        comment = self.comment()
        self.client.force_authenticate(self.student)

        moved = self.client.patch(
            detail_url(comment), {"course": self.other_course.pk}, format="json"
        )
        put = self.client.put(
            detail_url(comment), {"course": self.course.pk, "text": "x"}, format="json"
        )

        self.assertEqual(moved.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(put.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    # Delete
    def test_author_course_teacher_and_admin_can_delete(self):
        for user in (self.student, self.teacher, self.admin):
            with self.subTest(user=user.email):
                comment = self.comment()
                self.client.force_authenticate(user)
                response = self.client.delete(detail_url(comment))
                self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
                self.assertFalse(CourseComment.objects.filter(pk=comment.pk).exists())

    def test_classmates_and_other_teachers_cannot_delete(self):
        comment = self.comment()
        for user in (self.classmate, self.other_teacher):
            with self.subTest(user=user.email):
                self.client.force_authenticate(user)
                response = self.client.delete(detail_url(comment))
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(CourseComment.objects.filter(pk=comment.pk).exists())

    # Reply
    def test_course_teacher_can_reply_edit_and_remove_the_reply(self):
        comment = self.comment()
        self.client.force_authenticate(self.teacher)

        created = self.client.post(reply_url(comment), {"reply": " Thank you! "}, format="json")
        self.assertEqual(created.status_code, status.HTTP_200_OK)
        self.assertEqual(created.json()["reply"], "Thank you!")
        self.assertEqual(created.json()["replied_by_name"], "teacher@example.com")
        self.assertTrue(created.json()["can_reply"])

        edited = self.client.post(reply_url(comment), {"reply": "Edited"}, format="json")
        self.assertEqual(edited.json()["reply"], "Edited")

        removed = self.client.delete(reply_url(comment))
        self.assertEqual(removed.status_code, status.HTTP_200_OK)
        comment.refresh_from_db()
        self.assertEqual((comment.reply, comment.replied_by, comment.replied_at), ("", None, None))

    def test_admin_can_reply(self):
        comment = self.comment()
        self.client.force_authenticate(self.admin)

        response = self.client.post(reply_url(comment), {"reply": "Noted"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_others_cannot_reply(self):
        comment = self.comment()
        for user in (self.student, self.classmate, self.other_teacher):
            with self.subTest(user=user.email):
                self.client.force_authenticate(user)
                response = self.client.post(reply_url(comment), {"reply": "Hi"}, format="json")
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        comment.refresh_from_db()
        self.assertEqual(comment.reply, "")

    def test_empty_reply_is_rejected(self):
        comment = self.comment()
        self.client.force_authenticate(self.teacher)

        response = self.client.post(reply_url(comment), {"reply": "  "}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("reply", response.json()["error"]["fields"])

    def test_student_editing_keeps_the_reply(self):
        comment = self.comment(reply="Answer", replied_by=self.teacher)
        self.client.force_authenticate(self.student)

        self.client.patch(detail_url(comment), {"text": "More details"}, format="json")

        comment.refresh_from_db()
        self.assertEqual(comment.reply, "Answer")

    def test_posting_is_rate_limited(self):
        self.client.force_authenticate(self.student)
        for _ in range(30):
            self.client.post(URL, {"course": self.course.pk, "text": "Hi"}, format="json")

        response = self.client.post(URL, {"course": self.course.pk, "text": "Hi"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(CourseComment.objects.count(), 30)

    def test_voice_question_routes_still_work(self):
        self.client.force_authenticate(self.student)
        response = self.client.get("/api/voice-questions/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
