from django.contrib import admin

from .models import Chore, ChoreInstance, RecurrenceRule


class RecurrenceRuleInline(admin.StackedInline):
    model = RecurrenceRule
    extra = 0


@admin.register(Chore)
class ChoreAdmin(admin.ModelAdmin):
    list_display = ("title", "household", "is_recurring", "points", "default_assignee")
    list_filter = ("is_recurring", "household")
    search_fields = ("title",)
    inlines = [RecurrenceRuleInline]


@admin.register(ChoreInstance)
class ChoreInstanceAdmin(admin.ModelAdmin):
    list_display = ("chore", "due_date", "assigned_member", "status", "completed_at")
    list_filter = ("status", "due_date")
    search_fields = ("chore__title",)
    date_hierarchy = "due_date"
