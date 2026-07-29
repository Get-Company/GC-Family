from django.contrib import admin

from .models import Chore, ChoreContribution, ChoreInstance, RecurrenceRule


class RecurrenceRuleInline(admin.StackedInline):
    model = RecurrenceRule
    extra = 0


class ChoreContributionInline(admin.TabularInline):
    model = ChoreContribution
    extra = 0
    readonly_fields = ("member", "share", "completed_at")
    can_delete = False


@admin.register(Chore)
class ChoreAdmin(admin.ModelAdmin):
    list_display = ("title", "household", "is_recurring", "points", "default_assignee")
    list_filter = ("is_recurring", "household")
    search_fields = ("title",)
    inlines = [RecurrenceRuleInline]


@admin.register(ChoreInstance)
class ChoreInstanceAdmin(admin.ModelAdmin):
    list_display = (
        "chore",
        "due_date",
        "assigned_member",
        "status",
        "completed_by",
        "completed_at",
    )
    list_filter = ("status", "due_date")
    search_fields = ("chore__title",)
    date_hierarchy = "due_date"
    list_select_related = ("chore", "assigned_member", "completed_by")
    inlines = [ChoreContributionInline]


@admin.register(ChoreContribution)
class ChoreContributionAdmin(admin.ModelAdmin):
    list_display = ("instance", "member", "share", "completed_at")
    list_filter = ("member",)
    search_fields = ("instance__chore__title", "member__display_name")
    date_hierarchy = "completed_at"
    list_select_related = ("instance__chore", "member")
    readonly_fields = ("instance", "member", "share", "completed_at")
