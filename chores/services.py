"""Fachlogik rund um Aufgaben — v. a. die Materialisierung von Serien.

Aus einer `RecurrenceRule` werden konkrete `ChoreInstance`-Zeilen für ein
Datumsfenster erzeugt. Bereits vorhandene Instanzen (unique chore+due_date)
werden dank `get_or_create` nicht dupliziert.
"""

from __future__ import annotations

import calendar
import datetime as dt

from django.utils import timezone

from .models import Chore, ChoreInstance, RecurrenceRule

# Standard-Horizont: so viele Tage im Voraus materialisieren.
DEFAULT_HORIZON_DAYS = 14


def _months_between(a: dt.date, b: dt.date) -> int:
    """Ganze Monate zwischen a und b (b >= a)."""
    return (b.year - a.year) * 12 + (b.month - a.month)


def _week_start(day: dt.date) -> dt.date:
    """Sonntag als Beginn der in der Oberfläche verwendeten Familienwoche."""
    return day - dt.timedelta(days=(day.weekday() + 1) % 7)


def _flexible_week_matches(rule: RecurrenceRule, week_start: dt.date) -> bool:
    """Prüft eine wöchentliche Aufgabe ohne festen Wochentag pro Wochenfenster."""
    week_end = week_start + dt.timedelta(days=6)
    if week_end < rule.start_date:
        return False
    if rule.end_date and week_start > rule.end_date:
        return False
    anchor = _week_start(rule.start_date)
    weeks = (week_start - anchor).days // 7
    return weeks >= 0 and weeks % rule.interval == 0


def rule_matches(rule: RecurrenceRule, day: dt.date) -> bool:
    """Trifft die Wiederholungsregel auf diesen Tag zu?"""
    if day < rule.start_date:
        return False
    if rule.end_date and day > rule.end_date:
        return False

    if rule.frequency == RecurrenceRule.Frequency.DAILY:
        return (day - rule.start_date).days % rule.interval == 0

    if rule.frequency == RecurrenceRule.Frequency.WEEKLY:
        # Regeln ohne Wochentag werden in materialize_chore als Wochenfenster
        # behandelt, nicht als zufällig am Startdatum fällige Tagesaufgabe.
        if not rule.weekdays:
            return False
        weekdays = rule.weekdays
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
    if rule.frequency == RecurrenceRule.Frequency.WEEKLY and not rule.weekdays:
        week_start = _week_start(start)
        while week_start <= end:
            if _flexible_week_matches(rule, week_start):
                week_end = week_start + dt.timedelta(days=6)
                if rule.end_date:
                    week_end = min(week_end, rule.end_date)
                instance, was_created = ChoreInstance.objects.get_or_create(
                    chore=chore,
                    due_date=week_start,
                    defaults={
                        "assigned_member": chore.default_assignee,
                        "active_until": week_end,
                    },
                )
                if was_created:
                    assignees = list(chore.default_assignees.all())
                    if assignees:
                        instance.assigned_members.set(assignees)
                        instance.assigned_member = assignees[0]
                        instance.save(update_fields=["assigned_member"])
                    created.append(instance)
            week_start += dt.timedelta(days=7)
        return created

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
    start = start or timezone.localdate()
    end = start + dt.timedelta(days=horizon_days)

    created: list[ChoreInstance] = []
    recurring = household.chores.filter(is_recurring=True).select_related("recurrence")
    for chore in recurring:
        created.extend(materialize_chore(chore, start, end))
    return created


def instance_is_current(instance: ChoreInstance, today: dt.date) -> bool:
    """Datum und Regelstart gelten auch für flexible Wochenaufgaben."""
    rule = getattr(instance.chore, "recurrence", None)
    return (
        instance.due_date <= today <= (instance.active_until or instance.due_date)
        and (rule is None or rule.start_date <= today)
    )


def next_occurrence(rule: RecurrenceRule, after: dt.date) -> dt.date | None:
    """Nächster Termin ohne Materialisierung eines großen Zukunftsfensters."""
    start = max(after + dt.timedelta(days=1), rule.start_date)
    interval = max(1, rule.interval)
    candidate = None
    if rule.frequency == RecurrenceRule.Frequency.DAILY:
        elapsed = (start - rule.start_date).days
        candidate = rule.start_date + dt.timedelta(days=((elapsed + interval - 1) // interval) * interval)
    elif rule.frequency == RecurrenceRule.Frequency.WEEKLY:
        if not rule.weekdays:
            anchor = _week_start(rule.start_date)
            elapsed = (_week_start(start) - anchor).days // 7
            week = anchor + dt.timedelta(weeks=((elapsed + interval - 1) // interval) * interval)
            candidate = max(week, rule.start_date)
            if candidate <= after:
                candidate = week + dt.timedelta(weeks=interval)
        else:
            # Entspricht der bestehenden, am Startdatum verankerten Wochenregel.
            elapsed = (start - rule.start_date).days // 7
            block = (elapsed // interval) * interval
            for week in (block, block + interval):
                anchor = rule.start_date + dt.timedelta(weeks=week)
                dates = [anchor + dt.timedelta(days=offset) for offset in range(7)]
                matches = [day for day in dates if day >= start and day.weekday() in rule.weekdays]
                if matches:
                    candidate = min(matches)
                    break
    elif rule.frequency == RecurrenceRule.Frequency.MONTHLY:
        elapsed = _months_between(rule.start_date, start)
        month_offset = ((elapsed + interval - 1) // interval) * interval
        # Der gregorianische Kalender wiederholt sich nach 4800 Monaten.
        for _ in range(4800):
            month_index = rule.start_date.year * 12 + rule.start_date.month - 1 + month_offset
            year, month = divmod(month_index, 12)
            month += 1
            if year > 9999:
                break
            target = rule.day_of_month or rule.start_date.day
            if target <= calendar.monthrange(year, month)[1]:
                day = dt.date(year, month, target)
                if day >= start:
                    candidate = day
                    break
            month_offset += interval
    if candidate and (rule.end_date is None or candidate <= rule.end_date):
        return candidate
    return None
