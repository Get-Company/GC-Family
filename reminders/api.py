from __future__ import annotations

import datetime as dt

from django.shortcuts import get_object_or_404
from ninja import Router, Schema
from ninja.errors import HttpError

from accounts.auth import family_jwt_auth, require_parent
from accounts.models import FamilyMember
from reminders import home_assistant
from reminders.models import Reminder

router = Router(tags=["reminders"], auth=family_jwt_auth)


class DeviceOut(Schema):
    service: str
    name: str


class DevicesOut(Schema):
    configured: bool
    devices: list[DeviceOut]
    error: str | None = None


class DeviceIn(Schema):
    service: str


class ReminderIn(Schema):
    member_id: int
    kind: str
    chore_id: int | None = None
    message: str = ""
    time: dt.time
    weekdays: list[int]
    enabled: bool = True


class ReminderOut(ReminderIn):
    id: int
    last_sent_at: dt.datetime | None
    last_error: str


@router.get("/devices", response=DevicesOut)
def list_devices(request):
    require_parent(request)
    if not home_assistant.configured():
        return {"configured": False, "devices": [], "error": "Home Assistant ist noch nicht eingerichtet. Server-URL und Token in der Server-Konfiguration ergänzen."}
    try:
        return {"configured": True, "devices": home_assistant.devices()}
    except home_assistant.HomeAssistantError as error:
        return {"configured": True, "devices": [], "error": str(error)}


@router.put("/members/{member_id}/device", response=DeviceIn)
def update_device(request, member_id: int, payload: DeviceIn):
    auth = require_parent(request)
    member = get_object_or_404(FamilyMember, id=member_id, household=auth.household)
    if payload.service:
        if not home_assistant.valid_service(payload.service):
            raise HttpError(422, "Bitte ein Handy aus der Liste auswählen.")
        try:
            known = {device["service"] for device in home_assistant.devices()}
        except home_assistant.HomeAssistantError as error:
            raise HttpError(503, str(error)) from None
        if payload.service not in known:
            raise HttpError(422, "Dieses Handy ist in Home Assistant nicht verfügbar.")
    member.notification_service = payload.service
    member.save(update_fields=["notification_service"])
    return payload


@router.post("/members/{member_id}/test", response={204: None})
def test_device(request, member_id: int):
    auth = require_parent(request)
    member = get_object_or_404(FamilyMember, id=member_id, household=auth.household)
    try:
        home_assistant.notify(member.notification_service, f"Hallo {member.display_name}! Deine GC-Family-Erinnerungen kommen hier an.", f"gc-family-test-{member.id}")
    except home_assistant.HomeAssistantError as error:
        raise HttpError(503, str(error)) from None
    return 204, None


@router.get("", response=list[ReminderOut])
def list_reminders(request):
    return list(Reminder.objects.filter(member__household=require_parent(request).household))


def _save(request, payload: ReminderIn, reminder: Reminder | None = None):
    household = require_parent(request).household
    member = get_object_or_404(FamilyMember, id=payload.member_id, household=household)
    if payload.kind not in Reminder.Kind.values:
        raise HttpError(422, "Bitte einen gültigen Inhalt auswählen.")
    if not payload.weekdays or any(day not in range(7) for day in payload.weekdays):
        raise HttpError(422, "Bitte mindestens einen gültigen Wochentag auswählen.")
    if payload.time.tzinfo or payload.time.second or payload.time.microsecond:
        raise HttpError(422, "Bitte eine Uhrzeit in Stunden und Minuten angeben (Europe/Berlin).")
    if len(payload.message) > 500 or (payload.kind == Reminder.Kind.MESSAGE and not payload.message.strip()):
        raise HttpError(422, "Bitte einen Hinweis mit 1 bis 500 Zeichen eingeben.")
    chore = None
    if payload.kind == Reminder.Kind.CHORE:
        chore = get_object_or_404(household.chores, id=payload.chore_id)
    reminder = reminder or Reminder()
    reminder.member = member
    reminder.chore = chore
    reminder.kind = payload.kind
    reminder.message = payload.message.strip()
    reminder.time = payload.time
    reminder.weekdays = sorted(set(payload.weekdays))
    reminder.enabled = payload.enabled
    reminder.last_error = ""
    reminder.save()
    return reminder


@router.post("", response=ReminderOut)
def create_reminder(request, payload: ReminderIn):
    return _save(request, payload)


@router.put("/{reminder_id}", response=ReminderOut)
def update_reminder(request, reminder_id: int, payload: ReminderIn):
    reminder = get_object_or_404(Reminder, id=reminder_id, member__household=require_parent(request).household)
    return _save(request, payload, reminder)


@router.delete("/{reminder_id}", response={204: None})
def delete_reminder(request, reminder_id: int):
    get_object_or_404(Reminder, id=reminder_id, member__household=require_parent(request).household).delete()
    return 204, None
