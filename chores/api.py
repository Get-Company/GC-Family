"""Ninja-Router für Aufgaben (Instanzen + Mitglieder).

HINWEIS: In dieser Phase noch ohne Auth — es wird der erste (Demo-)Haushalt
verwendet. Die echte Mandantentrennung/Authentifizierung folgt in Phase 2.
"""

from __future__ import annotations

import datetime as dt

from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import Router, Schema

from accounts.models import FamilyMember, Household
from chores.models import ChoreInstance

router = Router(tags=["chores"])


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


def _current_household() -> Household:
    """Platzhalter bis Phase-2-Auth: nimmt den ersten Haushalt."""
    household = Household.objects.first()
    if household is None:
        raise Http404("Kein Haushalt vorhanden — bitte seed_demo ausführen.")
    return household


# --- Endpoints ---


@router.get("/members", response=list[MemberOut])
def list_members(request):
    household = _current_household()
    return list(household.members.all())


@router.get("/instances", response=list[InstanceOut])
def list_instances(
    request,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    member_id: int | None = None,
):
    """Aufgaben-Instanzen im Zeitfenster (Default: heute)."""
    household = _current_household()
    date_from = date_from or dt.date.today()
    date_to = date_to or date_from

    qs = (
        ChoreInstance.objects.filter(
            chore__household=household,
            due_date__gte=date_from,
            due_date__lte=date_to,
        )
        .select_related("chore", "assigned_member")
        .order_by("due_date", "chore__title")
    )
    if member_id is not None:
        qs = qs.filter(assigned_member_id=member_id)
    return list(qs)


@router.post("/instances/{instance_id}/complete", response=InstanceOut)
def complete_instance(request, instance_id: int, payload: CompleteIn):
    household = _current_household()
    instance = get_object_or_404(
        ChoreInstance, id=instance_id, chore__household=household
    )
    member = None
    if payload.member_id is not None:
        member = get_object_or_404(
            FamilyMember, id=payload.member_id, household=household
        )
    instance.status = ChoreInstance.Status.DONE
    instance.completed_at = timezone.now()
    instance.completed_by = member or instance.assigned_member
    instance.save(update_fields=["status", "completed_at", "completed_by"])
    return instance


@router.post("/instances/{instance_id}/skip", response=InstanceOut)
def skip_instance(request, instance_id: int):
    household = _current_household()
    instance = get_object_or_404(
        ChoreInstance, id=instance_id, chore__household=household
    )
    instance.status = ChoreInstance.Status.SKIPPED
    instance.completed_at = None
    instance.completed_by = None
    instance.save(update_fields=["status", "completed_at", "completed_by"])
    return instance
