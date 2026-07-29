"""Ninja-Router für Aufgaben eines authentifizierten Haushalts."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import File, Router, Schema
from ninja.errors import HttpError
from ninja.files import UploadedFile

from accounts.auth import current_auth, family_jwt_auth, require_parent
from accounts.models import FamilyMember, Household
from chores.models import Chore, ChoreContribution, ChoreInstance, RecurrenceRule
from chores.services import DEFAULT_HORIZON_DAYS, materialize_chore

router = Router(tags=["chores"], auth=family_jwt_auth)
public_router = Router(tags=["public"])


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
    description: str
    icon: str
    color: str
    image_url: str | None
    points: int
    due_date: dt.date
    active_until: dt.date | None
    category: str
    status: str
    assigned_member_id: int | None
    assigned_member_name: str | None
    assigned_member_ids: list[int]
    assigned_member_names: list[str]
    completed_at: dt.datetime | None
    completed_by_id: int | None
    completed_by_name: str | None
    contributions: list["ContributionOut"]

    @staticmethod
    def resolve_title(obj: ChoreInstance) -> str:
        return obj.chore.title

    @staticmethod
    def resolve_description(obj: ChoreInstance) -> str:
        return obj.chore.description

    @staticmethod
    def resolve_category(obj: ChoreInstance) -> str:
        recurrence = getattr(obj.chore, "recurrence", None)
        return recurrence.frequency if recurrence else "MANUAL"

    @staticmethod
    def resolve_icon(obj: ChoreInstance) -> str:
        return obj.chore.icon

    @staticmethod
    def resolve_color(obj: ChoreInstance) -> str:
        return obj.chore.color

    @staticmethod
    def resolve_image_url(obj: ChoreInstance) -> str | None:
        return obj.chore.image.url if obj.chore.image else None

    @staticmethod
    def resolve_points(obj: ChoreInstance) -> int:
        return obj.chore.points

    @staticmethod
    def resolve_assigned_member_name(obj: ChoreInstance) -> str | None:
        return obj.assigned_member.display_name if obj.assigned_member else None

    @staticmethod
    def resolve_assigned_member_ids(obj: ChoreInstance) -> list[int]:
        return list(obj.assigned_members.values_list("id", flat=True))

    @staticmethod
    def resolve_assigned_member_names(obj: ChoreInstance) -> list[str]:
        return list(obj.assigned_members.values_list("display_name", flat=True))

    @staticmethod
    def resolve_completed_by_name(obj: ChoreInstance) -> str | None:
        return obj.completed_by.display_name if obj.completed_by else None

    @staticmethod
    def resolve_contributions(obj: ChoreInstance) -> list[ChoreContribution]:
        return list(obj.contributions.all())


class ContributionOut(Schema):
    member_id: int
    member_name: str
    member_emoji: str
    share: float
    completed_at: dt.datetime

    @staticmethod
    def resolve_member_name(obj: ChoreContribution) -> str:
        return obj.member.display_name

    @staticmethod
    def resolve_member_emoji(obj: ChoreContribution) -> str:
        return obj.member.emoji


class CompleteIn(Schema):
    member_id: int | None = None
    share: bool = False


class StatsOut(Schema):
    points_today: float
    current_streak: int


class MemberWeeklyStatsOut(Schema):
    member_id: int
    display_name: str
    emoji: str
    color: str
    completed_tasks: float
    points: float


class PublicDashboardOut(Schema):
    members: list[MemberOut]
    instances: list[InstanceOut]
    stats: list[MemberWeeklyStatsOut]


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
    default_assignee_ids: list[int] = []
    due_date: dt.date | None = None
    end_date: dt.date | None = None
    recurrence: RecurrenceIn | None = None


class ChoreOut(Schema):
    id: int
    title: str
    description: str
    icon: str
    color: str
    image_url: str | None
    points: int
    is_recurring: bool
    default_assignee_id: int | None
    default_assignee_ids: list[int]
    due_date: dt.date | None
    end_date: dt.date | None
    recurrence: RecurrenceOut | None

    @staticmethod
    def resolve_due_date(obj: Chore) -> dt.date | None:
        instance = obj.instances.order_by("due_date").first()
        return instance.due_date if instance else None

    @staticmethod
    def resolve_end_date(obj: Chore) -> dt.date | None:
        instance = obj.instances.order_by("due_date").first()
        return instance.active_until if instance else None

    @staticmethod
    def resolve_default_assignee_ids(obj: Chore) -> list[int]:
        return list(obj.default_assignees.values_list("id", flat=True))

    @staticmethod
    def resolve_image_url(obj: Chore) -> str | None:
        return obj.image.url if obj.image else None

    @staticmethod
    def resolve_recurrence(obj: Chore) -> RecurrenceRule | None:
        return getattr(obj, "recurrence", None)


# --- Endpoints ---


def _week_bounds() -> tuple[dt.date, dt.date]:
    """Die Familienwoche beginnt ausdrücklich am Sonntag um 00:00 Uhr."""
    today = dt.date.today()
    start = today - dt.timedelta(days=(today.weekday() + 1) % 7)
    return start, start + dt.timedelta(days=6)


def _with_instance_details(queryset):
    return queryset.select_related("chore", "chore__recurrence", "assigned_member", "completed_by").prefetch_related(
        "contributions__member", "assigned_members"
    )


def _points_for_contribution(contribution: ChoreContribution) -> float:
    points = Decimal(contribution.instance.chore.points) * contribution.share
    if contribution.share == Decimal("0.50"):
        points *= Decimal("1.20")
    return float(points)


def _weekly_stats(household, date_from: dt.date, date_to: dt.date):
    members = list(household.members.all())
    stats = {
        member.id: {"completed_tasks": Decimal("0"), "points": Decimal("0")}
        for member in members
    }
    contributions = ChoreContribution.objects.filter(
        instance__chore__household=household,
        instance__due_date__gte=date_from,
        instance__due_date__lte=date_to,
    ).select_related("instance__chore", "member")
    contributed_instance_ids = set()
    for contribution in contributions:
        contributed_instance_ids.add(contribution.instance_id)
        member_stats = stats[contribution.member_id]
        member_stats["completed_tasks"] += contribution.share
        member_stats["points"] += Decimal(str(_points_for_contribution(contribution)))

    # Bereits vorhandene, vor der Teilungsfunktion erledigte Aufgaben zählen weiter.
    legacy_instances = ChoreInstance.objects.filter(
        chore__household=household,
        due_date__gte=date_from,
        due_date__lte=date_to,
        status=ChoreInstance.Status.DONE,
        completed_by_id__isnull=False,
    ).exclude(id__in=contributed_instance_ids).select_related("chore")
    for instance in legacy_instances:
        member_stats = stats[instance.completed_by_id]
        member_stats["completed_tasks"] += Decimal("1")
        member_stats["points"] += Decimal(instance.chore.points)

    return [
        {
            "member_id": member.id,
            "display_name": member.display_name,
            "emoji": member.emoji,
            "color": member.color,
            "completed_tasks": float(stats[member.id]["completed_tasks"]),
            "points": float(stats[member.id]["points"]),
        }
        for member in members
    ]


@public_router.get("/dashboard", response=PublicDashboardOut)
def public_dashboard(request):
    """Öffentliche Familienansicht für die laufende Sonntag-bis-Samstag-Woche."""
    date_from, date_to = _week_bounds()
    household = Household.objects.order_by("id").first()
    if household is None:
        return {"members": [], "instances": [], "stats": []}
    instances = _with_instance_details(
        ChoreInstance.objects.filter(
            chore__household=household,
            due_date__lte=date_to,
        ).filter(
            Q(active_until__gte=date_from)
            | Q(active_until__isnull=True, due_date__gte=date_from)
        ).order_by("due_date", "chore__title")
    )
    return {
        "members": list(household.members.all()),
        "instances": list(instances),
        "stats": _weekly_stats(household, date_from, date_to),
    }


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

    qs = _with_instance_details(
        ChoreInstance.objects.filter(
            chore__household=auth.household,
            due_date__lte=date_to,
        ).filter(
            Q(active_until__gte=date_from)
            | Q(active_until__isnull=True, due_date__gte=date_from)
        ).order_by("due_date", "chore__title")
    )
    if not auth.is_parent:
        if member_id not in {None, auth.member.id}:
            raise HttpError(403, "Kinder können nur ihre eigenen Aufgaben sehen.")
        # Vergangene Wochen gehören in den Eltern-Verlauf. Kinder können nur
        # Aufgaben der am Sonntag beginnenden aktuellen Woche abrufen.
        week_start = dt.date.today() - dt.timedelta(days=(dt.date.today().weekday() + 1) % 7)
        if date_to < week_start:
            return []
        qs = qs.filter(
            Q(assigned_member_id=auth.member.id)
            | Q(assigned_members=auth.member)
            | Q(assigned_member__isnull=True, assigned_members__isnull=True),
            due_date__gte=week_start,
        ).distinct()
    elif member_id is not None:
        qs = qs.filter(
            Q(assigned_member_id=member_id) | Q(assigned_members=member_id)
        ).distinct()
    return list(qs)


@router.get("/stats", response=StatsOut)
def stats(request):
    """Liefert Punkte und Tages-Streak für das aktuell angemeldete Profil."""
    auth = current_auth(request)
    completed_dates = set(ChoreContribution.objects.filter(
        instance__chore__household=auth.household,
        member=auth.member,
        instance__status=ChoreInstance.Status.DONE,
    ).values_list("instance__due_date", flat=True).distinct())
    streak = 0
    day = dt.date.today()
    while day in completed_dates:
        streak += 1
        day -= dt.timedelta(days=1)
    points_today = sum(
        _points_for_contribution(contribution)
        for contribution in ChoreContribution.objects.filter(
            instance__chore__household=auth.household,
            member=auth.member,
            instance__due_date=dt.date.today(),
        ).select_related("instance__chore")
    )
    return {"points_today": points_today, "current_streak": streak}


@transaction.atomic
@transaction.atomic
@router.post("/instances/{instance_id}/complete", response=InstanceOut)
def complete_instance(request, instance_id: int, payload: CompleteIn):
    auth = current_auth(request)
    instance = get_object_or_404(
        ChoreInstance.objects.select_for_update(),
        id=instance_id,
        chore__household=auth.household,
    )
    member = auth.member
    if payload.member_id not in {None, auth.member.id}:
        raise HttpError(403, "Kinder können Aufgaben nicht für andere erledigen.")
    existing = list(instance.contributions.select_related("member").all())
    if instance.status in {ChoreInstance.Status.DONE, ChoreInstance.Status.SKIPPED}:
        raise HttpError(409, "Diese Aufgabe ist bereits abgeschlossen.")
    if instance.active_until and dt.date.today() > instance.active_until:
        raise HttpError(409, "Diese Aufgabe ist außerhalb ihres Erledigungszeitraums.")
    if any(contribution.member_id == member.id for contribution in existing):
        raise HttpError(409, "Du hast bereits einen Anteil dieser Aufgabe übernommen.")

    recurrence = getattr(instance.chore, "recurrence", None)
    if instance.due_date > dt.date.today() and (
        recurrence is None or recurrence.frequency == RecurrenceRule.Frequency.DAILY
    ):
        raise HttpError(409, "Diese Tagesaufgabe ist erst an ihrem vorgesehenen Tag verfügbar.")
    assigned_ids = set(instance.assigned_members.values_list("id", flat=True))
    if not assigned_ids and instance.assigned_member_id:
        assigned_ids.add(instance.assigned_member_id)

    if payload.share:
        # Den ersten Anteil darf nur das zugewiesene Kind übernehmen. Sobald
        # ein Anteil besteht, darf ein anderes Kind als Teammitglied ergänzen.
        if not existing and assigned_ids and auth.member.id not in assigned_ids:
            raise HttpError(403, "Diese Aufgabe ist nicht dir zugewiesen.")
        if len(existing) >= 2 or any(
            contribution.share != Decimal("0.50") for contribution in existing
        ):
            raise HttpError(409, "Diese Aufgabe kann nicht weiter geteilt werden.")
        ChoreContribution.objects.create(
            instance=instance,
            member=member,
            share=Decimal("0.50"),
        )
        if len(existing) == 1:
            instance.status = ChoreInstance.Status.DONE
            instance.completed_at = timezone.now()
            instance.completed_by = member
        else:
            instance.status = ChoreInstance.Status.PARTIAL
            instance.completed_at = None
            instance.completed_by = None
    else:
        if assigned_ids and auth.member.id not in assigned_ids:
            raise HttpError(403, "Diese Aufgabe ist nicht dir zugewiesen.")
        if existing:
            raise HttpError(409, "Die Aufgabe wird bereits geteilt erledigt.")
        ChoreContribution.objects.create(
            instance=instance,
            member=member,
            share=Decimal("1.00"),
        )
        instance.status = ChoreInstance.Status.DONE
        instance.completed_at = timezone.now()
        instance.completed_by = member
    instance.save(update_fields=["status", "completed_at", "completed_by"])
    return _with_instance_details(ChoreInstance.objects.filter(id=instance.id)).get()


@transaction.atomic
@router.post("/instances/{instance_id}/uncomplete", response=InstanceOut)
def uncomplete_instance(request, instance_id: int):
    """Nimmt den eigenen vollständigen oder halben Aufgabenanteil zurück."""
    auth = current_auth(request)
    instance = get_object_or_404(
        ChoreInstance.objects.select_for_update(),
        id=instance_id,
        chore__household=auth.household,
    )
    contribution = instance.contributions.filter(member=auth.member).first()
    if contribution is None:
        raise HttpError(409, "Du hast für diese Aufgabe keinen Anteil eingetragen.")
    contribution.delete()
    remaining = list(instance.contributions.all())
    if not remaining:
        instance.status = ChoreInstance.Status.OPEN
        instance.completed_at = None
        instance.completed_by = None
    elif len(remaining) == 1 and remaining[0].share == Decimal("0.50"):
        instance.status = ChoreInstance.Status.PARTIAL
        instance.completed_at = None
        instance.completed_by = None
    instance.save(update_fields=["status", "completed_at", "completed_by"])
    return _with_instance_details(ChoreInstance.objects.filter(id=instance.id)).get()


@router.post("/instances/{instance_id}/skip", response=InstanceOut)
def skip_instance(request, instance_id: int):
    auth = require_parent(request)
    instance = get_object_or_404(
        ChoreInstance, id=instance_id, chore__household=auth.household
    )
    instance.status = ChoreInstance.Status.SKIPPED
    instance.completed_at = None
    instance.completed_by = None
    instance.contributions.all().delete()
    instance.save(update_fields=["status", "completed_at", "completed_by"])
    return instance


@router.post("/instances/{instance_id}/reopen", response=InstanceOut)
def reopen_instance(request, instance_id: int):
    """Nimmt eine Erledigung zurück. Das dürfen ausschließlich Eltern."""
    auth = require_parent(request)
    instance = get_object_or_404(
        ChoreInstance, id=instance_id, chore__household=auth.household
    )
    instance.status = ChoreInstance.Status.OPEN
    instance.completed_at = None
    instance.completed_by = None
    instance.contributions.all().delete()
    instance.save(update_fields=["status", "completed_at", "completed_by"])
    return instance


def _assignees_for_payload(payload: ChoreIn, household) -> list[FamilyMember]:
    """Löst eine oder mehrere Zuweisungen auf und isoliert Haushalte strikt."""
    ids = set(payload.default_assignee_ids)
    if payload.default_assignee_id is not None:
        ids.add(payload.default_assignee_id)
    assignees = list(FamilyMember.objects.filter(id__in=ids, household=household))
    if len(assignees) != len(ids):
        raise HttpError(404, "Mindestens ein zugeordnetes Mitglied wurde nicht gefunden.")
    return assignees


def _validate_payload(payload: ChoreIn) -> None:
    """Prüft die für Einzelaufgaben und Serien jeweils notwendigen Felder."""
    if payload.points < 0:
        raise HttpError(422, "Punkte dürfen nicht negativ sein.")
    if payload.is_recurring and payload.recurrence is None:
        raise HttpError(422, "Eine Serien-Aufgabe benötigt eine Wiederholungsregel.")
    if not payload.is_recurring and payload.due_date is None:
        raise HttpError(422, "Eine Einzelaufgabe benötigt ein Fälligkeitsdatum.")
    if payload.end_date and payload.due_date and payload.end_date < payload.due_date:
        raise HttpError(422, "Das Ende darf nicht vor dem Startdatum liegen.")
    if payload.is_recurring and payload.end_date is not None:
        raise HttpError(422, "Ein Zeitraum ist nur für Einzelaufgaben möglich.")
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


def _apply_instance_assignees(instance: ChoreInstance, assignees: list[FamilyMember]) -> None:
    instance.assigned_members.set(assignees)
    instance.assigned_member = assignees[0] if assignees else None
    instance.save(update_fields=["assigned_member"])


def _materialize_after_change(chore: Chore, payload: ChoreIn) -> None:
    """Aktualisiert nur offene, zukünftige Instanzen und bewahrt erledigte Historie."""
    ChoreInstance.objects.filter(
        chore=chore,
        status=ChoreInstance.Status.OPEN,
    ).filter(
        Q(due_date__gte=dt.date.today()) | Q(active_until__gte=dt.date.today())
    ).delete()
    if chore.is_recurring:
        # Die frische Abfrage vermeidet einen leeren Reverse-Relation-Cache
        # nach `update_or_create`.
        chore = Chore.objects.select_related("recurrence", "default_assignee").prefetch_related("default_assignees").get(
            id=chore.id
        )
        materialize_chore(
            chore,
            dt.date.today(),
            dt.date.today() + dt.timedelta(days=DEFAULT_HORIZON_DAYS),
        )
    elif payload.due_date:
        instance, created = ChoreInstance.objects.get_or_create(
            chore=chore,
            due_date=payload.due_date,
            defaults={
                "active_until": payload.end_date,
            },
        )
        if created:
            _apply_instance_assignees(instance, list(chore.default_assignees.all()))


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
    assignees = _assignees_for_payload(payload, auth.household)
    chore = Chore.objects.create(
        household=auth.household,
        title=payload.title,
        description=payload.description,
        icon=payload.icon,
        color=payload.color,
        points=payload.points,
        is_recurring=payload.is_recurring,
        default_assignee=assignees[0] if assignees else None,
        created_by=auth.member.user,
    )
    chore.default_assignees.set(assignees)
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
    assignees = _assignees_for_payload(payload, auth.household)
    chore.default_assignee = assignees[0] if assignees else None
    chore.save()
    chore.default_assignees.set(assignees)
    if payload.recurrence:
        _write_recurrence(chore, payload.recurrence)
    else:
        RecurrenceRule.objects.filter(chore=chore).delete()
    _materialize_after_change(chore, payload)
    return chore


@router.post("/{chore_id}/image", response=ChoreOut)
def upload_chore_image(request, chore_id: int, image: UploadedFile = File(...)):
    """Hinterlegt ein optionales Bild an einer Aufgabe."""
    auth = require_parent(request)
    chore = get_object_or_404(Chore, id=chore_id, household=auth.household)
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HttpError(422, "Bitte wähle eine Bilddatei aus.")
    if image.size > 5 * 1024 * 1024:
        raise HttpError(422, "Das Aufgabenbild darf höchstens 5 MB groß sein.")
    chore.image.save(image.name, image, save=True)
    return chore


@transaction.atomic
@router.delete("/{chore_id}", response={204: None})
def delete_chore(request, chore_id: int):
    """Löscht eine Aufgaben-Definition samt zugehöriger Instanzen."""
    auth = require_parent(request)
    chore = get_object_or_404(Chore, id=chore_id, household=auth.household)
    chore.delete()
    return 204, None
