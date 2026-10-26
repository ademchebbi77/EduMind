from django.contrib import admin

from .models import VoiceQuestion


@admin.register(VoiceQuestion)
class VoiceQuestionAdmin(admin.ModelAdmin):
    list_display = ("__str__", "student", "course", "status", "detected_language", "created_at")
    list_filter = ("status", "detected_language", "created_at")
    search_fields = ("question_text", "transcript", "student__email", "course__title")
    readonly_fields = [field.name for field in VoiceQuestion._meta.fields]
