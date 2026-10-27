from django.contrib import admin

from .models import CourseComment, VoiceQuestion


@admin.register(CourseComment)
class CourseCommentAdmin(admin.ModelAdmin):
    list_display = ("__str__", "author", "course", "replied_by", "created_at")
    list_filter = ("created_at", "replied_at")
    search_fields = ("text", "reply", "author__email", "course__title")
    raw_id_fields = ("course", "author", "replied_by")


@admin.register(VoiceQuestion)
class VoiceQuestionAdmin(admin.ModelAdmin):
    list_display = ("__str__", "student", "course", "status", "detected_language", "created_at")
    list_filter = ("status", "detected_language", "created_at")
    search_fields = ("question_text", "transcript", "student__email", "course__title")
    readonly_fields = [field.name for field in VoiceQuestion._meta.fields]
