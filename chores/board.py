"""Kompakte Aufgabenübersicht: eine Kachel je Definition, Details direkt dabei."""

from __future__ import annotations

import datetime as dt

from django.db.models import DateTimeField, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone

from chores.models import ChoreCompletion, ChoreInstance
from chores.services import instance_is_current, materialize_household, next_occurrence


def with_instance_details(queryset):
    return queryset.select_related(
        "chore", "chore__recurrence", "assigned_member", "completed_by"
    ).prefetch_related("contributions__member", "assigned_members")


def task_board(household, today: dt.date | None = None) -> list[dict]:
    today = today or timezone.localdate()
    materialize_household(household, start=today, horizon_days=0)
    today_completions: dict[int, list[ChoreCompletion]] = {}
    for completion in ChoreCompletion.objects.filter(
        chore__household=household,
        chore__is_always_available=True,
        completed_at__date=today,
    ).select_related("member").order_by("-completed_at"):
        today_completions.setdefault(completion.chore_id, []).append(completion)
    base = ChoreInstance.objects.filter(chore_id=OuterRef("pk"))
    current = base.filter(due_date__lte=today).filter(
        Q(active_until__gte=today) | Q(active_until__isnull=True, due_date=today)
    ).order_by("-due_date")
    completed = base.filter(status=ChoreInstance.Status.DONE).order_by(
        Coalesce("completed_at", "due_date", output_field=DateTimeField()).desc(), "-due_date"
    )
    upcoming = base.filter(due_date__gt=today, status=ChoreInstance.Status.OPEN).order_by("due_date")
    chores = list(household.chores.select_related("recurrence", "default_assignee")
        .prefetch_related("default_assignees").annotate(
            current_id=Subquery(current.values("id")[:1]),
            completed_id=Subquery(completed.values("id")[:1]),
            upcoming_id=Subquery(upcoming.values("id")[:1]),
        ))
    ids = {value for chore in chores for value in (chore.current_id, chore.completed_id, chore.upcoming_id) if value}
    instances = {item.id: item for item in with_instance_details(ChoreInstance.objects.filter(id__in=ids))}
    tasks = []
    for chore in chores:
        always_available = chore.is_always_available
        instance = None if always_available else instances.get(chore.current_id)
        last = None if always_available else instances.get(chore.completed_id)
        upcoming_instance = None if always_available else instances.get(chore.upcoming_id)
        rule = getattr(chore, "recurrence", None)
        available = always_available or bool(
            instance
            and instance_is_current(instance, today)
            and instance.status in {"OPEN", "PARTIAL"}
        )
        next_date = None
        if not always_available:
            next_date = next_occurrence(rule, today) if rule else (upcoming_instance.due_date if upcoming_instance else None)
            # Vor Beginn einer flexiblen Woche existiert die Instanz bereits mit
            # dem Sonntag als Datum, freigeschaltet wird sie erst am Regelstart.
            if rule and rule.start_date > today:
                next_date = next_occurrence(rule, rule.start_date - dt.timedelta(days=1))
        assignees = list(instance.assigned_members.all()) if instance else list(chore.default_assignees.all())
        fallback = instance.assigned_member if instance else chore.default_assignee
        if not assignees and fallback:
            assignees = [fallback]
        completions = today_completions.get(chore.id, [])
        tasks.append({
            "id": chore.id,
            "title": chore.title,
            "description": chore.description,
            "icon": chore.icon,
            "color": chore.color,
            "image_url": chore.image.url if chore.image else None,
            "points": chore.points,
            "assigned_member_ids": [member.id for member in assignees],
            "assigned_member_names": [member.display_name for member in assignees],
            "assigned_members": assignees,
            "is_always_available": always_available,
            "completion_count_today": len(completions),
            "latest_always_available_completion": completions[0] if completions else None,
            "available": available,
            "next_available_on": next_date,
            "instance": instance,
            "last_completion": last,
        })
    return sorted(tasks, key=lambda task: (not task["available"], task["title"].casefold()))
