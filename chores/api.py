"""Ninja-Router für Aufgaben eines authentifizierten Haushalts."""

from __future__ import annotations

import datetime as dt

from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import Router, Schema
from ninja.errors import HttpError

from accounts.auth import current_auth, family_jwt_auth, require_parent
from accounts.models import FamilyMember
from chores.models import Chore, ChoreInstance, RecurrenceRule
from chores.services import DEFAULT_HORIZON_DAYS, materialize_chore

router = Router(tags=["chores"], auth=family_jwt_auth)


# --- Schemas ---


class MemberOut(Schema):
    id: int
    display_name: str
    role: str
    color: str
    emoji: str


class InstanceOut(Schema):
    id: int
    title: str
    icon: str
    color: str
    points: int
    due_date: dt.date
    status: str
    assigned_member_id: int | None
    assigned_member_name: str | None

    @staticmethod
    def resolve_title(obj: ChoreInstance) -> str:
        return obj.chore.title

    @staticmethod
    def resolve_icon(obj: ChoreInstance) -> str:
        return obj.chore.icon

    @staticmethod
    def resolve_color(obj: ChoreInstance) -> str:
        return obj.chore.color

    @staticmethod
    def resolve_points(obj: ChoreInstance) -> int:
        return obj.chore.points

    @staticmethod
    def resolve_assigned_member_name(obj: ChoreInstance) -> str | None:
        return obj.assigned_member.display_name if obj.assigned_member else None


class CompleteIn(Schema):
    member_id: int | None = None


class StatsOut(Schema):
    points_today: int
    current_streak: int


class RecurrenceIn(Schema):
    frequency: str
    interval: int = 1
    weekdays: list[int] = []
    day_of_month: int | None = None
    start_date: dt.date
    end_date: dt.date | None = None


class RecurrenceOut(RecurrenceIn):
    pass


class ChoreIn(Schema):
    title: str
    description: str = ""
    icon: str = ""
    color: str = "#6366f1"
    points: int = 0
    is_recurring: bool = False
    default_assignee_id: int | None = None
    due_date: dt.date | None = None
    recurrence: RecurrenceIn | None = None


class ChoreOut(Schema):
    id: int
    title: str
    description: str
    icon: str
    color: str
    points: int
    is_recurring: bool
    default_assignee_id: int | None
    due_date: dt.date | None
    recurrence: RecurrenceOut | None

    @staticmethod
    def resolve_due_date(obj: Chore) -> dt.date | None:
        instance = obj.instances.order_by("due_date").first()
        return instance.due_date if instance else None

    @staticmethod
    def resolve_recurrence(obj: Chore) -> RecurrenceRule | None:
        return getattr(obj, "recurrence", None)


# --- Endpoints ---


@router.get("/members", response=list[MemberOut])
def list_members(request):
    return list(current_auth(request).household.members.all())


@router.get("/instances", response=list[InstanceOut])
def list_instances(
    request,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    member_id: int | None = None,
):
    """Aufgaben-Instanzen im Zeitfenster (Default: heute)."""
    auth = current_auth(request)
    date_from = date_from or dt.date.today()
    date_to = date_to or date_from

    qs = (
        ChoreInstance.objects.filter(
            chore__household=auth.household,
            due_date__gte=date_from,
            due_date__lte=date_to,
        )
        .select_related("chore", "assigned_member")
        .order_by("due_date", "chore__title")
    )
    if not auth.is_parent:
        if member_id not in {None, auth.member.id}:
            raise HttpError(403, "Kinder können nur ihre eigenen Aufgaben sehen.")
        qs = qs.filter(assigned_member_id=auth.member.id)
    elif member_id is not None:
        qs = qs.filter(assigned_member_id=member_id)
    return list(qs)


@router.get("/stats", response=StatsOut)
def stats(request):
    """Liefert Punkte und Tages-Streak für das aktuell angemeldete Profil."""
    auth = current_auth(request)
    completed_dates = set(
        ChoreInstance.objects.filter(
            chore__household=auth.household,
            completed_by=auth.member,
            status=ChoreInstance.Status.DONE,
        )
        .values_list("due_date", flat=True)
        .distinct()
    )
    streak = 0
    day = dt.date.today()
    while day in completed_dates:
        streak += 1
        day -= dt.timedelta(days=1)
    points_today = (
        ChoreInstance.objects.filter(
            chore__household=auth.household,
            completed_by=auth.member,
            status=ChoreInstance.Status.DONE,
            due_date=dt.date.today(),
        ).aggregate(points=Sum("chore__points"))["points"]
        or 0
    )
    return {"points_today": points_today, "current_streak": streak}


@router.post("/instances/{instance_id}/complete", response=InstanceOut)
def complete_instance(request, instance_id: int, payload: CompleteIn):
    auth = current_auth(request)
    instance = get_object_or_404(
        ChoreInstance, id=instance_id, chore__household=auth.household
    )
    member = auth.member
    if auth.is_parent and payload.member_id is not None:
        member = get_object_or_404(
            FamilyMember, id=payload.member_id, household=auth.household
        )
    elif not auth.is_parent:
        if payload.member_id not in {None, auth.member.id}:
            raise HttpError(403, "Kinder können Aufgaben nicht für andere erledigen.")
        if instance.assigned_member_id != auth.member.id:
            raise HttpError(403, "Diese Aufgabe ist nicht dir zugewiesen.")
    instance.status = ChoreInstance.Status.DONE
    instance.completed_at = timezone.now()
    instance.completed_by = member
    instance.save(update_fields=["status", "completed_at", "completed_by"])
    return instance


@router.post("/instances/{instance_id}/skip", response=InstanceOut)
def skip_instance(request, instance_id: int):
    auth = require_parent(request)
    instance = get_object_or_404(
        ChoreInstance, id=instance_id, chore__household=auth.household
    )
    instance.status = ChoreInstance.Status.SKIPPED
    instance.completed_at = None
    instance.completed_by = None
    instance.save(update_fields=["status", "completed_at", "completed_by"])
    return instance


def _assignee_for_payload(payload: ChoreIn, household) -> FamilyMember | None:
    """Löst die feste Zuweisung auf und verhindert IDs aus fremden Haushalten."""
    if payload.default_assignee_id is None:
        return None
    return get_object_or_404(
        FamilyMember,
        id=payload.default_assignee_id,
        household=household,
    )


def _validate_payload(payload: ChoreIn) -> None:
    """Prüft die für Einzelaufgaben und Serien jeweils notwendigen Felder."""
    if payload.points < 0:
        raise HttpError(422, "Punkte dürfen nicht negativ sein.")
    if payload.is_recurring and payload.recurrence is None:
        raise HttpError(422, "Eine Serien-Aufgabe benötigt eine Wiederholungsregel.")
    if not payload.is_recurring and payload.due_date is None:
        raise HttpError(422, "Eine Einzelaufgabe benötigt ein Fälligkeitsdatum.")
    if payload.recurrence:
        if payload.recurrence.frequency not in RecurrenceRule.Frequency.values:
            raise HttpError(422, "Die Wiederholungsfrequenz ist ungültig.")
        if payload.recurrence.interval < 1:
            raise HttpError(422, "Das Intervall muss mindestens 1 sein.")
        if payload.recurrence.day_of_month and not 1 <= payload.recurrence.day_of_month <= 31:
            raise HttpError(422, "Der Monatstag muss zwischen 1 und 31 liegen.")
        if any(day not in range(7) for day in payload.recurrence.weekdays):
            raise HttpError(422, "Wochentage müssen zwischen 0 (Montag) und 6 liegen.")


def _write_recurrence(chore: Chore, recurrence: RecurrenceIn) -> None:
    """Speichert eine Regel als vollständige Repräsentation aus dem Formular."""
    RecurrenceRule.objects.update_or_create(
        chore=chore,
        defaults={
            "frequency": recurrence.frequency,
            "interval": recurrence.interval,
            "weekdays": recurrence.weekdays,
            "day_of_month": recurrence.day_of_month,
            "start_date": recurrence.start_date,
            "end_date": recurrence.end_date,
        },
    )


def _materialize_after_change(chore: Chore, payload: ChoreIn) -> None:
    """Aktualisiert nur offene, zukünftige Instanzen und bewahrt erledigte Historie."""
    ChoreInstance.objects.filter(
        chore=chore,
        due_date__gte=dt.date.today(),
        status=ChoreInstance.Status.OPEN,
    ).delete()
    if chore.is_recurring:
        # Die frische Abfrage vermeidet einen leeren Reverse-Relation-Cache
        # nach `update_or_create`.
        chore = Chore.objects.select_related("recurrence", "default_assignee").get(
            id=chore.id
        )
        materialize_chore(
            chore,
            dt.date.today(),
            dt.date.today() + dt.timedelta(days=DEFAULT_HORIZON_DAYS),
        )
    elif payload.due_date:
        ChoreInstance.objects.get_or_create(
            chore=chore,
            due_date=payload.due_date,
            defaults={"assigned_member": chore.default_assignee},
        )


@router.get("", response=list[ChoreOut])
def list_chores(request):
    """Listet Aufgaben-Definitionen für die Elternverwaltung."""
    auth = require_parent(request)
    return list(
        auth.household.chores.select_related("default_assignee", "recurrence")
        .prefetch_related("instances")
        .all()
    )


@transaction.atomic
@router.post("", response=ChoreOut)
def create_chore(request, payload: ChoreIn):
    """Erstellt eine Aufgabe mit fester Zuweisung und materialisiert ihre Instanzen."""
    auth = require_parent(request)
    _validate_payload(payload)
    chore = Chore.objects.create(
        household=auth.household,
        title=payload.title,
        description=payload.description,
        icon=payload.icon,
        color=payload.color,
        points=payload.points,
        is_recurring=payload.is_recurring,
        default_assignee=_assignee_for_payload(payload, auth.household),
        created_by=auth.member.user,
    )
    if payload.recurrence:
        _write_recurrence(chore, payload.recurrence)
    _materialize_after_change(chore, payload)
    return chore


@transaction.atomic
@router.put("/{chore_id}", response=ChoreOut)
def update_chore(request, chore_id: int, payload: ChoreIn):
    """Aktualisiert eine Aufgabe und erzeugt ihre künftigen Instanzen neu."""
    auth = require_parent(request)
    _validate_payload(payload)
    chore = get_object_or_404(Chore, id=chore_id, household=auth.household)
    chore.title = payload.title
    chore.description = payload.description
    chore.icon = payload.icon
    chore.color = payload.color
    chore.points = payload.points
    chore.is_recurring = payload.is_recurring
    chore.default_assignee = _assignee_for_payload(payload, auth.household)
    chore.save()
    if payload.recurrence:
        _write_recurrence(chore, payload.recurrence)
    else:
        RecurrenceRule.objects.filter(chore=chore).delete()
    _materialize_after_change(chore, payload)
    return chore


@transaction.atomic
@router.delete("/{chore_id}", response={204: None})
def delete_chore(request, chore_id: int):
    """Löscht eine Aufgaben-Definition samt zugehöriger Instanzen."""
    auth = require_parent(request)
    chore = get_object_or_404(Chore, id=chore_id, household=auth.household)
    chore.delete()
    return 204, None
