from django.contrib import admin

from .models import (
    AnswerOption,
    Exercise,
    ExerciseSubmission,
    Question,
    Quiz,
    QuizAttempt,
)


class QuestionInline(admin.StackedInline):
    model = Question
    extra = 0
    fields = ("position", "text", "type", "points", "explanation")


class AnswerOptionInline(admin.TabularInline):
    model = AnswerOption
    extra = 0
    fields = ("position", "text", "is_correct")


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ("title", "course", "difficulty", "is_published", "created_at")
    list_filter = ("difficulty", "is_published", "created_at")
    search_fields = ("title", "description", "course__title")
    autocomplete_fields = ("course",)
    readonly_fields = ("created_at", "updated_at")
    inlines = (QuestionInline,)


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("__str__", "quiz", "type", "points")
    list_filter = ("type",)
    search_fields = ("text", "quiz__title")
    inlines = (AnswerOptionInline,)


@admin.register(QuizAttempt)
class QuizAttemptAdmin(admin.ModelAdmin):
    list_display = ("quiz", "student", "status", "score", "max_score", "percentage", "passed")
    list_filter = ("status", "passed")
    search_fields = ("quiz__title", "student__email")
    readonly_fields = (
        "quiz",
        "student",
        "status",
        "score",
        "max_score",
        "percentage",
        "passed",
        "started_at",
        "expires_at",
        "submitted_at",
    )


@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = ("title", "course", "difficulty", "points", "is_published", "created_at")
    list_filter = ("difficulty", "is_published", "created_at")
    search_fields = ("title", "description", "course__title")
    autocomplete_fields = ("course",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(ExerciseSubmission)
class ExerciseSubmissionAdmin(admin.ModelAdmin):
    list_display = ("exercise", "student", "score", "graded_at", "updated_at")
    search_fields = ("exercise__title", "student__email")
    readonly_fields = ("submitted_at", "updated_at", "graded_at", "graded_by")
