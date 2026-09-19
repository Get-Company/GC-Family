"""Zeitgesteuerter Versand mit persistentem Tagesstatus und kurzen Retries."""

from __future__ import annotations

import datetime as dt

from django.db import transaction
from django.utils import timezone

from chores.board import task_board
from reminders import home_assistant
from reminders.models import Reminder, ReminderDelivery

GRACE_PERIOD = dt.timedelta(minutes=15)


def message_for(reminder: Reminder, today: dt.date) -> str | None:
    if reminder.kind == Reminder.Kind.MESSAGE:
        return reminder.message
    tasks = task_board(reminder.member.household, today)
    relevant = []
    for task in tasks:
        if not task["available"]:
            continue
        if reminder.kind == Reminder.Kind.CHORE and task["id"] != reminder.chore_id:
            continue
        if task["is_always_available"]:
            relevant.append(task["title"])
            continue
        instance = task["instance"]
        contributions = list(instance.contributions.all())
        if any(item.member_id == reminder.member_id for item in contributions):
            continue
        assigned = task["assigned_member_ids"]
        if assigned and reminder.member_id not in assigned and instance.status != "PARTIAL":
            continue
        relevant.append(task["title"])
    if not relevant:
        return None
    prefix = reminder.message or f"Hallo {reminder.member.display_name}, noch offen:"
    return f"{prefix}\n" + ", ".join(relevant)


def send_due_reminders(now: dt.datetime | None = None) -> int:
    now = timezone.localtime(now or timezone.now())
    sent = 0
    for reminder_id in Reminder.objects.filter(enabled=True).values_list("id", flat=True):
        sent += _send_one(reminder_id, now)
    return sent


@transaction.atomic
def _send_one(reminder_id: int, now: dt.datetime) -> int:
    # Sperre bleibt bis nach dem HTTP-Aufruf erhalten: parallele Scheduler
    # können denselben Tagesversand nicht gleichzeitig übernehmen.
    reminder = Reminder.objects.select_for_update().filter(id=reminder_id, enabled=True).first()
    if reminder is None or now.weekday() not in reminder.weekdays:
        return 0
    due = timezone.make_aware(dt.datetime.combine(now.date(), reminder.time))
    if not due <= now < due + GRACE_PERIOD or reminder.created_at > now:
        return 0
    delivery, _ = ReminderDelivery.objects.get_or_create(reminder=reminder, date=now.date())
    if delivery.status in {"SENT", "SKIPPED"} or delivery.attempts >= 3:
        return 0
    if delivery.attempted_at and now - delivery.attempted_at < dt.timedelta(minutes=1):
        return 0
    delivery.attempted_at = now
    delivery.attempts += 1
    message = message_for(reminder, now.date())
    if message is None:
        delivery.status = "SKIPPED"
        reminder.last_error = ""
    else:
        try:
            home_assistant.notify(reminder.member.notification_service, message, f"gc-family-{reminder.id}-{now.date()}")
            delivery.status = "SENT"
            reminder.last_sent_at = now
            reminder.last_error = ""
        except home_assistant.HomeAssistantError as error:
            delivery.status = "FAILED"
            reminder.last_error = str(error)[:240]
    delivery.save()
    reminder.save(update_fields=["last_sent_at", "last_error"])
    return int(delivery.status == "SENT")
