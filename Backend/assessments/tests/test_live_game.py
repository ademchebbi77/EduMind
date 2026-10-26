from datetime import timedelta
from unittest import mock

from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from assessments.live import points_for
from assessments.models import LiveAnswer, LiveGame
from courses.tests.utils import TemporaryMediaMixin

from .utils import create_course, create_quiz, make_user


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class LiveGameTests(TemporaryMediaMixin, APITestCase):
    def setUp(self):
        self.teacher = make_user("teacher@example.com", User.Role.TEACHER)
        self.alice = make_user("alice@example.com", User.Role.STUDENT, first_name="Alice")
        self.bob = make_user("bob@example.com", User.Role.STUDENT, first_name="Bob")
        course = create_course(self.teacher)
        self.quiz = create_quiz(
            course,
            questions=[
                ("single_choice", 1, [("Paris", True), ("Lyon", False)]),
                ("true_false", 1, [("True", False), ("False", True)]),
            ],
        )
        self.questions = list(self.quiz.questions.prefetch_related("options"))

    # helpers
    def as_user(self, user):
        self.client.force_login(user)

    def create_game(self):
        self.as_user(self.teacher)
        return self.client.post("/api/live-games/", {"quiz": self.quiz.pk}, format="json").json()

    def join(self, user, pin):
        self.as_user(user)
        return self.client.post("/api/live-games/join/", {"pin": pin}, format="json")

    def next(self, game_id):
        self.as_user(self.teacher)
        return self.client.post(f"/api/live-games/{game_id}/next/").json()

    def answer(self, user, game_id, option_text, question=0):
        option = next(o for o in self.questions[question].options.all() if o.text == option_text)
        self.as_user(user)
        return self.client.post(
            f"/api/live-games/{game_id}/answer/", {"selected_options": [option.id]}, format="json"
        )

    # tests
    def test_full_game(self):
        game = self.create_game()
        self.assertEqual((game["status"], len(game["pin"])), ("lobby", 6))

        self.join(self.alice, game["pin"])
        self.join(self.bob, game["pin"])
        self.as_user(self.teacher)
        self.assertEqual(self.client.get(f"/api/live-games/{game['id']}/").json()["players"], ["Alice", "Bob"])

        state = self.next(game["id"])  # question 1
        self.assertEqual((state["status"], state["question_number"]), ("question", 1))
        self.assertEqual(self.answer(self.alice, game["id"], "Paris").status_code, 200)
        self.answer(self.bob, game["id"], "Lyon")

        state = self.next(game["id"])  # results 1
        self.assertEqual(state["status"], "results")
        paris = next(o.id for o in self.questions[0].options.all() if o.text == "Paris")
        self.assertEqual(state["correct_options"], [paris])
        self.assertEqual(sum(state["answer_counts"].values()), 2)
        self.assertEqual(state["leaderboard"][0]["name"], "Alice")

        self.next(game["id"])  # question 2
        self.next(game["id"])  # results 2
        state = self.next(game["id"])  # end
        self.assertEqual(state["status"], "finished")
        self.assertEqual(self.next_status_code(game["id"]), 400)

    def next_status_code(self, game_id):
        self.as_user(self.teacher)
        return self.client.post(f"/api/live-games/{game_id}/next/").status_code

    def test_correct_answers_are_hidden_during_the_question(self):
        game = self.create_game()
        self.join(self.alice, game["pin"])
        self.next(game["id"])

        self.as_user(self.alice)
        state = self.client.get(f"/api/live-games/{game['id']}/").json()

        self.assertNotIn("correct_options", state)
        self.assertNotIn("is_correct", str(state["question"]))
        self.answer(self.alice, game["id"], "Paris")
        me = self.client.get(f"/api/live-games/{game['id']}/").json()["me"]
        self.assertTrue(me["answered"])
        self.assertIsNone(me["last_correct"])  # revealed only with the results

    def test_scoring_rewards_speed(self):
        self.assertEqual(points_for(False, 1), 0)
        self.assertEqual(points_for(True, 0), 1000)
        self.assertEqual(points_for(True, 10), 750)
        self.assertEqual(points_for(True, 20), 500)

    def test_one_answer_per_question_and_time_limit(self):
        game = self.create_game()
        self.join(self.alice, game["pin"])
        self.join(self.bob, game["pin"])
        self.next(game["id"])

        self.answer(self.alice, game["id"], "Paris")
        self.assertEqual(self.answer(self.alice, game["id"], "Lyon").status_code, 400)

        LiveGame.objects.filter(pk=game["id"]).update(
            question_started_at=timezone.now() - timedelta(seconds=30)
        )
        self.assertEqual(self.answer(self.bob, game["id"], "Paris").status_code, 400)
        self.assertEqual(LiveAnswer.objects.count(), 1)

    def test_invalid_answers(self):
        game = self.create_game()
        self.join(self.alice, game["pin"])
        self.as_user(self.alice)
        url = f"/api/live-games/{game['id']}/answer/"
        self.assertEqual(self.client.post(url, {"selected_options": [1]}, format="json").status_code, 400)  # lobby

        self.next(game["id"])
        self.as_user(self.alice)
        other = self.questions[1].options.first().id
        both = [o.id for o in self.questions[0].options.all()]
        for selected in ([], [other], both, "x"):
            with self.subTest(selected=selected):
                response = self.client.post(url, {"selected_options": selected}, format="json")
                self.assertEqual(response.status_code, 400)

    def test_permissions(self):
        other_teacher = make_user("other@example.com", User.Role.TEACHER)
        self.as_user(other_teacher)
        self.assertEqual(self.client.post("/api/live-games/", {"quiz": self.quiz.pk}, format="json").status_code, 403)
        self.as_user(self.alice)
        self.assertEqual(self.client.post("/api/live-games/", {"quiz": self.quiz.pk}, format="json").status_code, 403)

        game = self.create_game()
        self.assertEqual(self.join(self.teacher, game["pin"]).status_code, 403)  # teachers host, not play
        self.assertEqual(self.join(self.alice, "000000" if game["pin"] != "000000" else "111111").status_code, 400)

        # Only the host moves the game; only members can see it.
        self.join(self.alice, game["pin"])
        self.assertEqual(self.client.post(f"/api/live-games/{game['id']}/next/").status_code, 403)
        self.as_user(self.bob)
        self.assertEqual(self.client.get(f"/api/live-games/{game['id']}/").status_code, 404)

    def test_quiz_without_questions(self):
        empty = create_quiz(self.quiz.course, questions=[])
        self.as_user(self.teacher)
        self.assertEqual(self.client.post("/api/live-games/", {"quiz": empty.pk}, format="json").status_code, 400)

    def test_pins_are_unique_among_running_games(self):
        with mock.patch("assessments.live.secrets.randbelow", side_effect=[123456, 123456, 654321]):
            first = self.create_game()
            second = self.create_game()
        self.assertEqual((first["pin"], second["pin"]), ("123456", "654321"))
