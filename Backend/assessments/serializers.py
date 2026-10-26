import logging
from decimal import Decimal
from pathlib import Path

import filetype
from django.conf import settings
from django.db import transaction
from django.urls import reverse
from django.utils import timezone
from rest_framework import serializers

from courses.models import Course
from courses.validators import validate_course_file

from .generation.extraction import SUPPORTED_EXTENSIONS
from .generation.generator import QUESTION_TYPES
from .generation.service import record_feedback
from .models import (
    AnswerOption,
    Exercise,
    ExerciseSubmission,
    Question,
    Quiz,
    QuizAttempt,
    QuizGenerationJob,
)
from .permissions import can_manage_course

logger = logging.getLogger(__name__)

MAX_QUESTIONS = 100
MAX_OPTIONS = 10
MAX_SUBMISSION_LENGTH = 20000


def _require_text(value, message):
    value = (value or "").strip()
    if not value:
        raise serializers.ValidationError(message)
    return value


class AnnotatedField(serializers.ReadOnlyField):
    """Read a value annotated by the view queryset, with a fallback when absent."""

    def __init__(self, fallback=None, **kwargs):
        self.fallback = fallback
        super().__init__(**kwargs)

    def get_attribute(self, instance):
        value = getattr(instance, self.field_name, None)
        if value is None:
            return self.fallback
        return float(value) if isinstance(value, Decimal) else value


class CourseOwnershipMixin:
    """Reject courses the current user cannot manage (owner teacher or admin)."""

    course_error = "You can only add content to courses you own."

    def validate_course(self, course):
        request = self.context["request"]
        if not can_manage_course(request.user, course):
            raise serializers.ValidationError(self.course_error)
        return course


# --- Quizzes -----------------------------------------------------------------


class AnswerOptionSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = AnswerOption
        fields = ("id", "text", "is_correct")

    def validate_text(self, value):
        return _require_text(value, "Enter the answer text.")


class QuestionSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    options = AnswerOptionSerializer(many=True)

    class Meta:
        model = Question
        fields = ("id", "text", "type", "type_display", "points", "explanation", "options")

    def validate_text(self, value):
        return _require_text(value, "Enter the question text.")

    def validate_explanation(self, value):
        return (value or "").strip()

    def validate(self, attrs):
        options = attrs.get("options", [])
        question_type = attrs.get("type")
        correct = [option for option in options if option.get("is_correct")]

        if question_type == Question.Type.TRUE_FALSE:
            if len(options) != 2:
                raise serializers.ValidationError(
                    {"options": "A true/false question must have exactly two options."}
                )
        elif len(options) < 2:
            raise serializers.ValidationError(
                {"options": "Add at least two answer options."}
            )
        if len(options) > MAX_OPTIONS:
            raise serializers.ValidationError(
                {"options": f"A question cannot have more than {MAX_OPTIONS} options."}
            )

        texts = [option["text"].casefold() for option in options]
        if len(set(texts)) != len(texts):
            raise serializers.ValidationError(
                {"options": "Each answer option must be different."}
            )

        if not correct:
            raise serializers.ValidationError(
                {"options": "Mark at least one option as correct."}
            )
        if question_type != Question.Type.MULTIPLE_CHOICE and len(correct) != 1:
            raise serializers.ValidationError(
                {"options": "This question type requires exactly one correct option."}
            )
        return attrs


class PublicAnswerOptionSerializer(serializers.ModelSerializer):
    """Answer option without its correctness flag, for quiz takers."""

    class Meta:
        model = AnswerOption
        fields = ("id", "text")


class PublicQuestionSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    options = PublicAnswerOptionSerializer(many=True, read_only=True)

    class Meta:
        model = Question
        fields = ("id", "text", "type", "type_display", "points", "options")


class QuizSerializer(CourseOwnershipMixin, serializers.ModelSerializer):
    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.all())
    course_title = serializers.CharField(source="course.title", read_only=True)
    course_owner = serializers.IntegerField(source="course.owner_id", read_only=True)
    difficulty_display = serializers.CharField(
        source="get_difficulty_display", read_only=True
    )
    question_count = serializers.SerializerMethodField()
    total_points = serializers.SerializerMethodField()
    questions = QuestionSerializer(many=True)
    # Optional on create: the generation job this quiz was reviewed from, used
    # to measure how many generated questions the teacher kept.
    generation_job = serializers.PrimaryKeyRelatedField(
        queryset=QuizGenerationJob.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    course_error = "You can only add quizzes to courses you own."

    class Meta:
        model = Quiz
        fields = (
            "id",
            "course",
            "course_title",
            "course_owner",
            "title",
            "description",
            "difficulty",
            "difficulty_display",
            "duration_minutes",
            "passing_score",
            "max_attempts",
            "reveal_answers",
            "is_published",
            "question_count",
            "total_points",
            "questions",
            "generation_job",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_generation_job(self, job):
        if job is None:
            return None
        user = self.context["request"].user
        if self.instance is not None or job.requested_by_id != user.id:
            raise serializers.ValidationError("This generation job cannot be linked to the quiz.")
        if job.status != QuizGenerationJob.Status.COMPLETED or job.quiz_id is not None:
            raise serializers.ValidationError("This generation job was already used or did not finish.")
        return job

    def get_question_count(self, obj):
        annotated = getattr(obj, "question_count", None)
        if annotated is not None:
            return annotated
        return len(obj.questions.all())

    def get_total_points(self, obj):
        annotated = getattr(obj, "total_points", None)
        if annotated is not None:
            return annotated
        return sum(question.points for question in obj.questions.all())

    def validate_title(self, value):
        return _require_text(value, "Enter the quiz title.")

    def validate_description(self, value):
        return (value or "").strip()

    def validate_questions(self, questions):
        if not questions:
            raise serializers.ValidationError("Add at least one question.")
        if len(questions) > MAX_QUESTIONS:
            raise serializers.ValidationError(
                f"A quiz cannot have more than {MAX_QUESTIONS} questions."
            )
        return questions

    def validate(self, attrs):
        questions = attrs.get("questions")
        if questions is None:
            return attrs

        # Ids sent back by the client must belong to this quiz; anything else
        # would let a request rewrite questions of another quiz.
        existing = {}
        if self.instance is not None:
            for question in self.instance.questions.prefetch_related("options"):
                existing[question.id] = {option.id for option in question.options.all()}

        seen_questions = set()
        for index, question in enumerate(questions):
            question_id = question.get("id")
            if question_id is None:
                if any(option.get("id") is not None for option in question["options"]):
                    raise serializers.ValidationError(
                        {"questions": f"Question {index + 1}: new questions cannot reuse options."}
                    )
                continue
            if question_id not in existing or question_id in seen_questions:
                raise serializers.ValidationError(
                    {"questions": f"Question {index + 1} does not belong to this quiz."}
                )
            seen_questions.add(question_id)
            option_ids = [o["id"] for o in question["options"] if o.get("id") is not None]
            if len(set(option_ids)) != len(option_ids) or not set(option_ids) <= existing[question_id]:
                raise serializers.ValidationError(
                    {"questions": f"Question {index + 1}: an option does not belong to it."}
                )
        return attrs

    @staticmethod
    def _save_options(question, options_data):
        existing = {option.id: option for option in question.options.all()}
        keep = set()
        for position, data in enumerate(options_data):
            option_id = data.get("id")
            if option_id is not None:
                option = existing[option_id]
                option.text = data["text"]
                option.is_correct = data.get("is_correct", False)
                option.position = position
                option.save()
                keep.add(option_id)
            else:
                AnswerOption.objects.create(
                    question=question,
                    text=data["text"],
                    is_correct=data.get("is_correct", False),
                    position=position,
                )
        question.options.exclude(pk__in=keep).filter(pk__in=existing.keys()).delete()

    def _save_questions(self, quiz, questions_data):
        existing = {question.id: question for question in quiz.questions.all()}
        keep = set()
        for position, data in enumerate(questions_data):
            data = dict(data)
            options_data = data.pop("options")
            question_id = data.pop("id", None)
            if question_id is not None:
                question = existing[question_id]
                for field, value in data.items():
                    setattr(question, field, value)
                question.position = position
                question.save()
                keep.add(question_id)
            else:
                question = Question.objects.create(quiz=quiz, position=position, **data)
            self._save_options(question, options_data)
        quiz.questions.filter(pk__in=set(existing) - keep).delete()

    @transaction.atomic
    def create(self, validated_data):
        questions_data = validated_data.pop("questions")
        generation_job = validated_data.pop("generation_job", None)
        quiz = Quiz.objects.create(**validated_data)
        self._save_questions(quiz, questions_data)
        if generation_job is not None:
            record_feedback(generation_job, quiz)
        return quiz

    @transaction.atomic
    def update(self, instance, validated_data):
        validated_data.pop("generation_job", None)
        questions_data = validated_data.pop("questions", None)
        instance = super().update(instance, validated_data)
        if questions_data is not None:
            self._save_questions(instance, questions_data)
        return instance

    def to_representation(self, instance):
        # Reload questions so the response reflects what was just saved.
        if hasattr(instance, "_prefetched_objects_cache"):
            instance._prefetched_objects_cache.pop("questions", None)
        return super().to_representation(instance)


class QuizListSerializer(QuizSerializer):
    """Quiz without questions, plus per-viewer attempt statistics."""

    attempt_count = AnnotatedField(fallback=0)
    my_attempt_count = AnnotatedField(fallback=0)
    my_best_percentage = AnnotatedField()

    class Meta(QuizSerializer.Meta):
        fields = tuple(
            field for field in QuizSerializer.Meta.fields if field != "questions"
        ) + ("attempt_count", "my_attempt_count", "my_best_percentage")


class PublicQuizSerializer(QuizListSerializer):
    """What a quiz taker sees: questions without correct answers or explanations."""

    questions = PublicQuestionSerializer(many=True, read_only=True)

    class Meta(QuizListSerializer.Meta):
        fields = QuizListSerializer.Meta.fields + ("questions",)


# --- Attempts ----------------------------------------------------------------


class QuizAttemptSerializer(serializers.ModelSerializer):
    quiz_title = serializers.CharField(source="quiz.title", read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_email = serializers.EmailField(source="student.email", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    percentage = serializers.FloatField(read_only=True)

    class Meta:
        model = QuizAttempt
        fields = (
            "id",
            "quiz",
            "quiz_title",
            "student",
            "student_name",
            "student_email",
            "status",
            "status_display",
            "score",
            "max_score",
            "percentage",
            "passed",
            "started_at",
            "expires_at",
            "submitted_at",
        )
        read_only_fields = fields


class QuizAttemptResultSerializer(QuizAttemptSerializer):
    """Attempt with its correction. Correct answers are only included once the
    attempt is closed, and only if the quiz reveals them or a manager asks."""

    passing_score = serializers.IntegerField(source="quiz.passing_score", read_only=True)
    answers_revealed = serializers.SerializerMethodField()
    answers = serializers.SerializerMethodField()

    class Meta(QuizAttemptSerializer.Meta):
        fields = QuizAttemptSerializer.Meta.fields + (
            "passing_score",
            "answers_revealed",
            "answers",
        )
        read_only_fields = fields

    def _reveal(self, attempt):
        if attempt.status == QuizAttempt.Status.IN_PROGRESS:
            return False
        if self.context.get("is_manager"):
            return True
        return attempt.quiz.reveal_answers

    def get_answers_revealed(self, attempt):
        return self._reveal(attempt)

    def get_answers(self, attempt):
        if attempt.status == QuizAttempt.Status.IN_PROGRESS:
            return []
        reveal = self._reveal(attempt)
        answers = (
            attempt.answers.select_related("question")
            .prefetch_related("selected_options", "question__options")
            .order_by("question__position", "question__id")
        )
        result = []
        for answer in answers:
            question = answer.question
            options = []
            for option in question.options.all():
                item = {"id": option.id, "text": option.text}
                if reveal:
                    item["is_correct"] = option.is_correct
                options.append(item)
            entry = {
                "question": question.id,
                "text": question.text,
                "type": question.type,
                "type_display": question.get_type_display(),
                "points": question.points,
                "options": options,
                "selected_options": sorted(o.id for o in answer.selected_options.all()),
                "is_correct": answer.is_correct,
                "points_awarded": answer.points_awarded,
            }
            if reveal:
                entry["explanation"] = question.explanation
            result.append(entry)
        return result


class AnswerInputSerializer(serializers.Serializer):
    question = serializers.IntegerField()
    selected_options = serializers.ListField(
        child=serializers.IntegerField(),
        allow_empty=True,
        max_length=MAX_OPTIONS,
    )


class QuizSubmissionSerializer(serializers.Serializer):
    answers = AnswerInputSerializer(many=True, max_length=MAX_QUESTIONS)


# --- Exercises ---------------------------------------------------------------


class ExerciseSubmissionSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_email = serializers.EmailField(source="student.email", read_only=True)
    graded_by_name = serializers.CharField(
        source="graded_by.full_name", read_only=True, default=None
    )
    max_points = serializers.IntegerField(source="exercise.points", read_only=True)
    is_graded = serializers.BooleanField(read_only=True)
    is_late = serializers.SerializerMethodField()

    class Meta:
        model = ExerciseSubmission
        fields = (
            "id",
            "exercise",
            "student",
            "student_name",
            "student_email",
            "content",
            "score",
            "max_points",
            "feedback",
            "is_graded",
            "is_late",
            "graded_by_name",
            "graded_at",
            "submitted_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_is_late(self, obj):
        due_at = obj.exercise.due_at
        return bool(due_at and obj.updated_at and obj.updated_at > due_at)


class SubmissionContentSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=MAX_SUBMISSION_LENGTH, trim_whitespace=True)


class GradeSubmissionSerializer(serializers.Serializer):
    score = serializers.IntegerField(min_value=0)
    feedback = serializers.CharField(required=False, allow_blank=True, max_length=5000)

    def validate_score(self, value):
        max_points = self.context["exercise"].points
        if value > max_points:
            raise serializers.ValidationError(
                f"The score cannot exceed {max_points} points."
            )
        return value


class ExerciseSerializer(CourseOwnershipMixin, serializers.ModelSerializer):
    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.all())
    course_title = serializers.CharField(source="course.title", read_only=True)
    course_owner = serializers.IntegerField(source="course.owner_id", read_only=True)
    difficulty_display = serializers.CharField(
        source="get_difficulty_display", read_only=True
    )
    submission_count = AnnotatedField(fallback=0)
    graded_count = AnnotatedField(fallback=0)
    my_submission_status = serializers.SerializerMethodField()
    my_score = AnnotatedField()
    attachment = serializers.FileField(
        write_only=True,
        required=False,
        validators=[validate_course_file],
    )
    remove_attachment = serializers.BooleanField(write_only=True, required=False, default=False)
    attachment_name = serializers.CharField(read_only=True)
    attachment_type = serializers.CharField(read_only=True)
    attachment_url = serializers.SerializerMethodField()
    attachment_download_url = serializers.SerializerMethodField()

    course_error = "You can only add exercises to courses you own."

    class Meta:
        model = Exercise
        fields = (
            "id",
            "course",
            "course_title",
            "course_owner",
            "title",
            "description",
            "instructions",
            "difficulty",
            "difficulty_display",
            "points",
            "due_at",
            "attachment",
            "remove_attachment",
            "attachment_name",
            "attachment_type",
            "attachment_url",
            "attachment_download_url",
            "is_published",
            "submission_count",
            "graded_count",
            "my_submission_status",
            "my_score",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return None
        return reverse("exercise-attachment", kwargs={"pk": obj.pk})

    def get_attachment_download_url(self, obj):
        if not obj.attachment:
            return None
        return reverse("exercise-attachment-download", kwargs={"pk": obj.pk})

    @staticmethod
    def _apply_attachment(validated_data):
        remove = validated_data.pop("remove_attachment", False)
        upload = validated_data.get("attachment")
        if upload:
            validated_data["attachment_name"] = Path(upload.name).name[:255]
        elif remove:
            validated_data["attachment"] = None
            validated_data["attachment_name"] = ""
        return upload is not None or remove

    def create(self, validated_data):
        self._apply_attachment(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        old_file = instance.attachment
        old_name = old_file.name if old_file else None
        storage = old_file.storage if old_file else None
        changed = self._apply_attachment(validated_data)
        updated = super().update(instance, validated_data)
        if changed and old_name and old_name != (updated.attachment.name or None):
            try:
                if storage.exists(old_name):
                    storage.delete(old_name)
            except Exception:
                logger.exception("Unable to delete the previous attachment of exercise %s", instance.pk)
        return updated

    def get_my_submission_status(self, obj):
        if getattr(obj, "my_submission_id", None) is None:
            return "none"
        return "graded" if getattr(obj, "my_graded_at", None) else "submitted"

    def validate_title(self, value):
        return _require_text(value, "Enter the exercise title.")

    def validate_description(self, value):
        return (value or "").strip()

    def validate_instructions(self, value):
        return _require_text(value, "Enter the exercise instructions.")

    def validate_points(self, value):
        if value < 1:
            raise serializers.ValidationError("Points must be at least 1.")
        if self.instance is not None and value < self.instance.points:
            highest = (
                self.instance.submissions.exclude(score=None)
                .order_by("-score")
                .values_list("score", flat=True)
                .first()
            )
            if highest is not None and value < highest:
                raise serializers.ValidationError(
                    f"A submission is already graded {highest} points; "
                    "the maximum cannot be lower."
                )
        return value

    def validate_due_at(self, value):
        if value and self.instance is None and value < timezone.now():
            raise serializers.ValidationError("The due date must be in the future.")
        return value


class ExerciseDetailSerializer(ExerciseSerializer):
    """Exercise plus the current student's own submission, if any."""

    my_submission = serializers.SerializerMethodField()

    class Meta(ExerciseSerializer.Meta):
        fields = ExerciseSerializer.Meta.fields + ("my_submission",)

    def get_my_submission(self, obj):
        user = self.context["request"].user
        submission = (
            obj.submissions.select_related("student", "graded_by", "exercise")
            .filter(student=user)
            .first()
        )
        if submission is None:
            return None
        return ExerciseSubmissionSerializer(submission, context=self.context).data


# --- Local quiz generator ----------------------------------------------------------


def course_text_status(course):
    """(available, reason) for using a course as generator source."""
    if course.type == Course.Type.PDF:
        return (True, "") if course.file else (False, "This course has no PDF file.")
    transcript = getattr(course, "transcript", None)
    if transcript is not None and transcript.status == "completed" and transcript.text.strip():
        return True, ""
    return False, "Generate this course's transcript first, or upload a document."


def validate_generation_file(upload):
    name = getattr(upload, "name", "") or ""
    extension = Path(name).suffix.lower().lstrip(".")
    formats = ", ".join(extension.upper() for extension in SUPPORTED_EXTENSIONS)
    if extension not in SUPPORTED_EXTENSIONS:
        raise serializers.ValidationError(f"Unsupported format. Accepted formats: {formats}.")
    size = getattr(upload, "size", 0) or 0
    if size <= 0:
        raise serializers.ValidationError("The file is empty.")
    if size > settings.MAX_UPLOAD_SIZE_BYTES:
        raise serializers.ValidationError(
            f"The file exceeds the maximum allowed size of {settings.MAX_UPLOAD_SIZE_MB} MB."
        )

    position = upload.tell()
    header = upload.read(4096)
    upload.seek(position)
    if extension in ("pdf", "docx"):
        kind = filetype.guess(header)
        if kind is None or kind.extension != extension:
            raise serializers.ValidationError("The file content does not match its extension.")
    elif b"\x00" in header:
        raise serializers.ValidationError("This does not look like a text file.")
    return upload


class QuizGenerationRequestSerializer(serializers.Serializer):
    """``course`` alone: read that course. ``file``: read the file, and ``course``
    is the course the quiz will belong to. ``file`` + ``create_course``: the PDF
    becomes a new course, which is then read and receives the quiz."""

    create_course = serializers.BooleanField(default=False)

    course = serializers.PrimaryKeyRelatedField(
        queryset=Course.objects.select_related("transcript"),
        required=False,
        allow_null=True,
    )
    file = serializers.FileField(required=False, validators=[validate_generation_file])
    num_questions = serializers.IntegerField(min_value=3, max_value=30, default=10)
    difficulty = serializers.ChoiceField(
        choices=[choice for choice, _ in QuizGenerationJob.DIFFICULTY_CHOICES],
        default=QuizGenerationJob.MIXED,
    )
    question_types = serializers.ListField(
        child=serializers.ChoiceField(choices=QUESTION_TYPES),
        min_length=1,
        default=list(QUESTION_TYPES),
    )

    def validate_course(self, course):
        if course is None:
            return None
        if not can_manage_course(self.context["request"].user, course):
            raise serializers.ValidationError(
                "You can only generate quizzes for courses you own."
            )
        return course

    def validate_question_types(self, value):
        return [type_ for type_ in QUESTION_TYPES if type_ in set(value)]

    def validate(self, attrs):
        if attrs.get("create_course"):
            upload = attrs.get("file")
            if upload is None:
                raise serializers.ValidationError(
                    {"file": ["Upload the PDF document that will become the course."]}
                )
            if Path(upload.name).suffix.lower() != ".pdf":
                raise serializers.ValidationError(
                    {"create_course": ["Only a PDF document can become a course."]}
                )
            attrs["course"] = None
            return attrs

        course = attrs.get("course")
        if course is None:
            raise serializers.ValidationError(
                {"course": ["Choose the course this quiz belongs to."]}
            )
        if attrs.get("file") is None:
            # The course itself is the source: it must contain readable text.
            available, reason = course_text_status(course)
            if not available:
                raise serializers.ValidationError({"course": [reason]})
        return attrs


class QuizGenerationJobSerializer(serializers.ModelSerializer):
    stage_display = serializers.CharField(source="get_stage_display", read_only=True)
    course_title = serializers.CharField(source="course.title", read_only=True, default=None)
    queue_ms = serializers.IntegerField(read_only=True)
    processing_ms = serializers.IntegerField(read_only=True)

    class Meta:
        model = QuizGenerationJob
        fields = (
            "id",
            "status",
            "stage",
            "stage_display",
            "progress",
            "source_name",
            "course",
            "course_title",
            "num_questions",
            "difficulty",
            "question_types",
            "language",
            "engine",
            "result",
            "stats",
            "error_message",
            "quiz",
            "feedback",
            "created_at",
            "started_at",
            "finished_at",
            "queue_ms",
            "processing_ms",
        )
        read_only_fields = fields
