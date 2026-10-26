"""Automatic Redis/Celery start-up with runserver (development convenience)."""

import subprocess
from unittest import mock

from django.test import SimpleTestCase, override_settings

from config import dev_services

RUNSERVER = ["manage.py", "runserver"]


@override_settings(AUTO_START_BACKGROUND_SERVICES=True, CELERY_TASK_ALWAYS_EAGER=False)
class ShouldStartTests(SimpleTestCase):
    def test_only_in_the_reloaded_runserver_process(self):
        self.assertTrue(dev_services.should_start(RUNSERVER, {"RUN_MAIN": "true"}))
        self.assertFalse(dev_services.should_start(RUNSERVER, {}))  # file-watching parent
        self.assertTrue(dev_services.should_start([*RUNSERVER, "--noreload"], {}))

    def test_never_for_other_commands(self):
        for argv in (["manage.py", "test"], ["manage.py", "migrate"], ["celery", "-A", "config"], ["manage.py"]):
            with self.subTest(argv=argv):
                self.assertFalse(dev_services.should_start(argv, {"RUN_MAIN": "true"}))

    @override_settings(AUTO_START_BACKGROUND_SERVICES=False)
    def test_can_be_disabled(self):
        self.assertFalse(dev_services.should_start(RUNSERVER, {"RUN_MAIN": "true"}))


def completed(code=0, stderr=""):
    return subprocess.CompletedProcess(args=[], returncode=code, stdout="", stderr=stderr)


@override_settings(CELERY_BROKER_URL="redis://127.0.0.1:6399/0")
class StartRedisTests(SimpleTestCase):
    def setUp(self):
        patcher = mock.patch.object(dev_services, "_say")
        self.say = patcher.start()
        self.addCleanup(patcher.stop)

    def test_already_running(self):
        with mock.patch.object(dev_services, "broker_reachable", return_value=True), \
                mock.patch.object(dev_services, "_docker") as docker:
            self.assertTrue(dev_services.start_redis())
        docker.assert_not_called()

    def test_starts_existing_container(self):
        with mock.patch.object(dev_services, "broker_reachable", side_effect=[False, True]), \
                mock.patch.object(dev_services.shutil, "which", return_value="docker"), \
                mock.patch.object(dev_services, "_docker", return_value=completed()) as docker:
            self.assertTrue(dev_services.start_redis())
        self.assertEqual([call.args[0] for call in docker.call_args_list], ["info", "start"])

    def test_creates_container_on_first_run(self):
        with mock.patch.object(dev_services, "broker_reachable", side_effect=[False, True]), \
                mock.patch.object(dev_services.shutil, "which", return_value="docker"), \
                mock.patch.object(
                    dev_services, "_docker", side_effect=[completed(), completed(1, "No such container"), completed()]
                ) as docker:
            self.assertTrue(dev_services.start_redis())
        run = docker.call_args_list[2].args
        self.assertEqual(run[:6], ("run", "-d", "--name", "edumind-redis", "-p", "6399:6379"))

    def test_without_docker(self):
        with mock.patch.object(dev_services, "broker_reachable", return_value=False), \
                mock.patch.object(dev_services.shutil, "which", return_value=None):
            self.assertFalse(dev_services.start_redis())

    def test_docker_desktop_stopped(self):
        with mock.patch.object(dev_services, "broker_reachable", return_value=False), \
                mock.patch.object(dev_services.shutil, "which", return_value="docker"), \
                mock.patch.object(dev_services, "_docker", return_value=completed(1)):
            self.assertFalse(dev_services.start_redis())
        self.assertIn("not running", self.say.call_args.args[0])


@override_settings(AUTO_START_BACKGROUND_SERVICES=True, CELERY_TASK_ALWAYS_EAGER=False)
class StartTests(SimpleTestCase):
    def test_starts_worker_when_redis_is_available(self):
        with mock.patch.object(dev_services, "should_start", return_value=True), \
                mock.patch.object(dev_services, "start_redis", return_value=True), \
                mock.patch.object(dev_services, "start_worker") as worker, \
                mock.patch.object(dev_services, "use_inline_jobs") as inline:
            dev_services.start()
        worker.assert_called_once()
        inline.assert_not_called()

    def test_runs_jobs_inline_without_redis(self):
        with mock.patch.object(dev_services, "should_start", return_value=True), \
                mock.patch.object(dev_services, "start_redis", return_value=False), \
                mock.patch.object(dev_services, "start_worker") as worker, \
                mock.patch.object(dev_services, "use_inline_jobs") as inline:
            dev_services.start()
        worker.assert_not_called()
        inline.assert_called_once()

    def test_worker_process_uses_this_python_and_is_stopped_on_exit(self):
        process = mock.Mock(pid=4321)
        process.poll.return_value = None
        with mock.patch.object(dev_services.subprocess, "Popen", return_value=process) as popen, \
                mock.patch.object(dev_services.atexit, "register") as register, \
                mock.patch.object(dev_services, "_say"):
            dev_services.start_worker()
        command = popen.call_args.args[0]
        self.assertEqual(command[1:5], ["-m", "celery", "-A", "config"])
        self.assertIn("--pool=solo", command)
        self.assertNotIn("RUN_MAIN", popen.call_args.kwargs["env"])
        register.assert_called_once_with(dev_services.stop_worker)

        dev_services.stop_worker()
        process.terminate.assert_called_once()
