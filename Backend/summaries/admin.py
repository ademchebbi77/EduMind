from django.contrib import admin

from .models import ChatMessage, Resource, Summary


@admin.register(Summary)
class SummaryAdmin(admin.ModelAdmin):
    list_display = ("title", "course", "author", "source", "updated_at")
    list_filter = ("source", "language")
    search_fields = ("title", "content")


@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = ("title", "course", "author", "kind", "updated_at")
    list_filter = ("kind",)
    search_fields = ("title", "description")


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("summary", "user", "created_at")
