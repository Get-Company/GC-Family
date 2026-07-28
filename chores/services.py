"""Fachlogik rund um Aufgaben — v. a. die Materialisierung von Serien.

Aus einer `RecurrenceRule` werden konkrete `ChoreInstance`-Zeilen für ein
Datumsfenster erzeugt. Bereits vorhandene Instanzen (unique chore+due_date)
werden dank `get_or_create` nicht dupliziert.
"""

from __future__ import annotations

import datetime as dt

from .models import Chore, ChoreInstance, RecurrenceRule

# Standard-Horizont: so viele Tage im Voraus materialisieren.
DEFAULT_HORIZON_DAYS = 14


def _months_between(a: dt.date, b: dt.date) -> int:
    """Ganze Monate zwischen a und b (b >= a)."""
    return (b.year - a.year) * 12 + (b.month - a.month)


def rule_matches(rule: RecurrenceRule, day: dt.date) -> bool:
    """Trifft die Wiederholungsregel auf diesen Tag zu?"""
    if day < rule.start_date:
        return False
    if rule.end_date and day > rule.end_date:
        return False

    if rule.frequency == RecurrenceRule.Frequency.DAILY:
        return (day - rule.start_date).days % rule.interval == 0

    if rule.frequency == RecurrenceRule.Frequency.WEEKLY:
        weekdays = rule.weekdays or [rule.start_date.weekday()]
        if day.weekday() not in weekdays:
            return False
        weeks = (day - rule.start_date).days // 7
        return weeks % rule.interval == 0

    if rule.frequency == RecurrenceRule.Frequency.MONTHLY:
        target_day = rule.day_of_month or rule.start_date.day
        if day.day != target_day:
            return False
        return _months_between(rule.start_date, day) % rule.interval == 0

    return False


def materialize_chore(
    chore: Chore,
    start: dt.date,
    end: dt.date,
) -> list[ChoreInstance]:
    """Erzeugt fehlende Instanzen einer *Serien*-Aufgabe im Fenster [start, end]."""
    if not chore.is_recurring:
        return []
    rule = getattr(chore, "recurrence", None)
    if rule is None:
        return []

    created: list[ChoreInstance] = []
    day = start
    while day <= end:
        if rule_matches(rule, day):
            instance, was_created = ChoreInstance.objects.get_or_create(
                chore=chore,
                due_date=day,
                defaults={"assigned_member": chore.default_assignee},
            )
            if was_created:
                assignees = list(chore.default_assignees.all())
                if assignees:
                    instance.assigned_members.set(assignees)
                    instance.assigned_member = assignees[0]
                    instance.save(update_fields=["assigned_member"])
                created.append(instance)
        day += dt.timedelta(days=1)
    return created


def materialize_household(
    household,
    start: dt.date | None = None,
    horizon_days: int = DEFAULT_HORIZON_DAYS,
) -> list[ChoreInstance]:
    """Materialisiert alle Serien-Aufgaben eines Haushalts über den Horizont."""
    start = start or dt.date.today()
    end = start + dt.timedelta(days=horizon_days)

    created: list[ChoreInstance] = []
    recurring = household.chores.filter(is_recurring=True).select_related("recurrence")
    for chore in recurring:
        created.extend(materialize_chore(chore, start, end))
    return created
