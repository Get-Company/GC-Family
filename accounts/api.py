"""Ninja-Router für Login, Token-Erneuerung und Geräte-Kontext."""

from __future__ import annotations

from django.contrib.auth import authenticate
from django.db import transaction
from django.shortcuts import get_object_or_404
from ninja import Router, Schema
from ninja.errors import HttpError
from ninja_jwt.exceptions import TokenError
from ninja_jwt.tokens import AccessToken, RefreshToken

from accounts.auth import current_auth, family_jwt_auth, require_parent
from accounts.models import FamilyMember, User

router = Router(tags=["auth"])


class MemberOut(Schema):
    id: int
    display_name: str
    role: str
    color: str
    emoji: str
    completion_jingle: str
    undo_jingle: str


class ManagedMemberOut(MemberOut):
    email: str | None

    @staticmethod
    def resolve_email(obj: FamilyMember) -> str | None:
        return obj.user.email if obj.user_id else None


class AuthMemberOut(MemberOut):
    """Eindeutiger Schema-Name, damit sich die OpenAPI-Schemata nicht mit
    der öffentlichen Aufgaben-Mitgliederliste überschneiden."""


class HouseholdOut(Schema):
    id: int
    name: str


class UserOut(Schema):
    id: int
    email: str
    can_access_backend: bool


class MeOut(Schema):
    authenticated: bool
    user: UserOut | None = None
    household: HouseholdOut
    member: AuthMemberOut


class LoginIn(Schema):
    email: str
    password: str


class PinIn(Schema):
    member_id: int
    pin: str


class FamilyPinIn(Schema):
    pin: str


class ParentMemberIn(Schema):
    display_name: str
    email: str
    pin: str
    color: str = "#2563eb"
    emoji: str = ""


class ChildMemberIn(Schema):
    display_name: str
    pin: str
    color: str = "#6366f1"
    emoji: str = ""
    completion_jingle: str = FamilyMember.Jingle.SPARKLE
    undo_jingle: str = FamilyMember.Jingle.SOFT


class ChildMemberUpdateIn(Schema):
    display_name: str
    pin: str | None = None
    color: str = "#6366f1"
    emoji: str = ""
    completion_jingle: str | None = None
    undo_jingle: str | None = None


class ParentMemberUpdateIn(Schema):
    display_name: str
    email: str
    pin: str | None = None
    color: str = "#2563eb"
    emoji: str = ""


class PinUpdateIn(Schema):
    pin: str


class AccessTokenOut(Schema):
    access: str


class TokenPairOut(AccessTokenOut):
    refresh: str


class RefreshIn(Schema):
    refresh: str


def _member_out(member: FamilyMember) -> dict[str, object]:
    return {
        "id": member.id,
        "display_name": member.display_name,
        "role": member.role,
        "color": member.color,
        "emoji": member.emoji,
        "completion_jingle": member.completion_jingle,
        "undo_jingle": member.undo_jingle,
    }


def _token_pair(user: User, member: FamilyMember) -> dict[str, str]:
    """Erstellt ein Refresh-/Access-Paar mit serverseitig geprüfter Mitgliedschaft."""
    refresh = RefreshToken.for_user(user)
    refresh["member_id"] = member.id
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def _access_for_member(member: FamilyMember) -> str:
    """Ein gemeinsamer PIN-Login erzeugt einen profilgebundenen Access-Token."""
    token = AccessToken.for_user(member.user) if member.user_id else AccessToken()
    token["member_id"] = member.id
    return str(token)


def _parent_member(user: User) -> FamilyMember:
    """Lädt das Elternprofil eines Kontos oder signalisiert eine unvollständige Einrichtung."""
    member = (
        FamilyMember.objects.select_related("household")
        .filter(user=user, role=FamilyMember.Role.PARENT)
        .first()
    )
    if member is None:
        raise HttpError(403, "Für dieses Konto ist kein Elternprofil eingerichtet.")
    return member


@router.post("/login", response=TokenPairOut)
def login(request, payload: LoginIn):
    """Meldet ein Elternkonto mit E-Mail und Passwort an."""
    user = authenticate(request, email=payload.email, password=payload.password)
    if user is None:
        raise HttpError(401, "E-Mail oder Passwort ist nicht korrekt.")
    return _token_pair(user, _parent_member(user))


@router.post("/refresh", response=AccessTokenOut)
def refresh(request, payload: RefreshIn):
    """Erstellt aus einem gültigen Eltern-Refresh-Token einen neuen Access-Token."""
    try:
        token = RefreshToken(payload.refresh)
    except TokenError:
        raise HttpError(401, "Der Refresh-Token ist ungültig oder abgelaufen.")

    member_id = token.get("member_id")
    if not isinstance(member_id, int):
        raise HttpError(401, "Der Refresh-Token enthält kein gültiges Elternprofil.")
    member = (
        FamilyMember.objects.filter(
            id=member_id,
            role=FamilyMember.Role.PARENT,
            user_id=token.get("user_id"),
        )
        .first()
    )
    if member is None:
        raise HttpError(401, "Das Elternprofil ist nicht mehr verfügbar.")
    return {"access": str(token.access_token)}


@router.get("/me", response=MeOut, auth=family_jwt_auth)
def me(request):
    """Liefert den aktuellen Token-Kontext einschließlich Haushalt und Profil."""
    auth = current_auth(request)
    user = None
    if auth.member.user_id:
        user = {
            "id": auth.member.user_id,
            "email": auth.member.user.email,
            "can_access_backend": auth.member.user.is_staff,
        }
    return {
        "authenticated": True,
        "user": user,
        "household": {"id": auth.household.id, "name": auth.household.name},
        "member": _member_out(auth.member),
    }


@router.get("/household/members", response=list[MemberOut], auth=family_jwt_auth)
def device_members(request):
    """Liefert Profile des aktuell am Familiengerät bekannten Haushalts."""
    auth = current_auth(request)
    return list(auth.household.members.all())


@router.post("/pin", response=AccessTokenOut, auth=family_jwt_auth)
def pin_login(request, payload: PinIn):
    """Schaltet für ein Kind mit PIN einen kurzlebigen, profilgebundenen Token aus."""
    device_auth = require_parent(request)
    member = (
        FamilyMember.objects.filter(
            id=payload.member_id,
            household=device_auth.household,
            role=FamilyMember.Role.CHILD,
        )
        .first()
    )
    if member is None or not member.check_pin(payload.pin):
        raise HttpError(401, "Die PIN ist nicht korrekt.")

    return {"access": _access_for_member(member)}


@router.post("/child-login", response=AccessTokenOut)
def child_login(request, payload: PinIn):
    """Meldet ein Kind direkt am sichtbaren Familien-Dashboard per PIN an."""
    member = (
        FamilyMember.objects.filter(
            id=payload.member_id,
            role=FamilyMember.Role.CHILD,
        )
        .first()
    )
    if member is None or not member.check_pin(payload.pin):
        raise HttpError(401, "Die PIN ist nicht korrekt.")
    return {"access": _access_for_member(member)}


@router.put("/me/pin", response=AuthMemberOut, auth=family_jwt_auth)
def update_own_child_pin(request, payload: PinUpdateIn):
    """Ein angemeldetes Kind darf ausschließlich seine eigene PIN ändern."""
    auth = current_auth(request)
    if auth.member.role != FamilyMember.Role.CHILD:
        raise HttpError(403, "Eltern ändern ihre PIN im Elternbereich.")
    _validate_pin(payload.pin)
    _ensure_pin_available(payload.pin, exclude_id=auth.member.id)
    auth.member.set_pin(payload.pin)
    auth.member.save(update_fields=["pin_hash"])
    return auth.member


def _validate_pin(pin: str) -> None:
    if len(pin) != 6 or not pin.isdigit():
        raise HttpError(422, "Die PIN muss aus genau sechs Ziffern bestehen.")


def _member_for_pin(pin: str, *, exclude_id: int | None = None) -> FamilyMember | None:
    """PIN-Hashes lassen sich nicht abfragen; bei der kleinen Familienliste
    werden sie deshalb sicher einzeln geprüft."""
    members = FamilyMember.objects.exclude(pin_hash="")
    if exclude_id is not None:
        members = members.exclude(id=exclude_id)
    for member in members.select_related("household", "user"):
        if member.check_pin(pin):
            return member
    return None


def _ensure_pin_available(pin: str, *, exclude_id: int | None = None) -> None:
    if _member_for_pin(pin, exclude_id=exclude_id) is not None:
        raise HttpError(409, "Diese PIN wird bereits von einem Familienprofil verwendet.")


def _validate_jingle(value: str) -> None:
    if value not in FamilyMember.Jingle.values:
        raise HttpError(422, "Dieser Jingle ist nicht verfügbar.")


def _validate_completion_jingle(value: str) -> None:
    _validate_jingle(value)
    if value not in {"SPARKLE", "BELL", "FANFARE", "BUBBLE", "CELEBRATE"}:
        raise HttpError(422, "Bitte wähle einen positiven Erledigt-Jingle.")


def _validate_undo_jingle(value: str) -> None:
    _validate_jingle(value)
    if value not in {"SOFT", "DOWNBEAT", "RAIN", "PLOP", "RESET"}:
        raise HttpError(422, "Bitte wähle einen negativen Abgewählt-Jingle.")


@router.post("/pin-login", response=AccessTokenOut)
def family_pin_login(request, payload: FamilyPinIn):
    """Einfacher sechsstelliger Login für Kinder und Eltern ohne Profilauswahl."""
    _validate_pin(payload.pin)
    member = _member_for_pin(payload.pin)
    if member is None:
        raise HttpError(401, "Diese PIN ist nicht bekannt.")
    return {"access": _access_for_member(member)}


@router.get(
    "/household/manage-members",
    response=list[ManagedMemberOut],
    auth=family_jwt_auth,
)
def managed_members(request):
    """Listet Mitglieder inklusive Eltern-E-Mail für die Elternverwaltung."""
    auth = require_parent(request)
    return list(auth.household.members.select_related("user").all())


@transaction.atomic
@router.post(
    "/household/manage-members/parents",
    response=ManagedMemberOut,
    auth=family_jwt_auth,
)
def create_parent_member(request, payload: ParentMemberIn):
    """Legt einen weiteren Eltern-Login samt Profil im aktuellen Haushalt an."""
    auth = require_parent(request)
    email = payload.email.strip().lower()
    if not payload.display_name.strip() or not email:
        raise HttpError(422, "Name und E-Mail-Adresse sind erforderlich.")
    _validate_pin(payload.pin)
    _ensure_pin_available(payload.pin)
    if User.objects.filter(email__iexact=email).exists():
        raise HttpError(409, "Diese E-Mail-Adresse wird bereits verwendet.")
    user = User.objects.create_user(
        username=email,
        email=email,
        password=None,
    )
    member = FamilyMember(
        household=auth.household,
        user=user,
        display_name=payload.display_name.strip(),
        role=FamilyMember.Role.PARENT,
        color=payload.color,
        emoji=payload.emoji,
    )
    member.set_pin(payload.pin)
    member.save()
    return member


@transaction.atomic
@router.post(
    "/household/manage-members/children",
    response=ManagedMemberOut,
    auth=family_jwt_auth,
)
def create_child_member(request, payload: ChildMemberIn):
    """Legt ein Kinderprofil mit einer sechsstelligen PIN an."""
    auth = require_parent(request)
    if not payload.display_name.strip():
        raise HttpError(422, "Ein Name ist erforderlich.")
    _validate_pin(payload.pin)
    _ensure_pin_available(payload.pin)
    _validate_completion_jingle(payload.completion_jingle)
    _validate_undo_jingle(payload.undo_jingle)
    member = FamilyMember(
        household=auth.household,
        display_name=payload.display_name.strip(),
        role=FamilyMember.Role.CHILD,
        color=payload.color,
        emoji=payload.emoji,
        completion_jingle=payload.completion_jingle,
        undo_jingle=payload.undo_jingle,
    )
    member.set_pin(payload.pin)
    member.save()
    return member


@transaction.atomic
@router.put(
    "/household/manage-members/children/{member_id}",
    response=ManagedMemberOut,
    auth=family_jwt_auth,
)
def update_child_member(request, member_id: int, payload: ChildMemberUpdateIn):
    """Aktualisiert ein Kinderprofil und bei Bedarf dessen PIN."""
    auth = require_parent(request)
    member = (
        FamilyMember.objects.filter(
            id=member_id,
            household=auth.household,
            role=FamilyMember.Role.CHILD,
        )
        .select_related("user")
        .first()
    )
    if member is None:
        raise HttpError(404, "Kinderprofil nicht gefunden.")
    if not payload.display_name.strip():
        raise HttpError(422, "Ein Name ist erforderlich.")
    member.display_name = payload.display_name.strip()
    member.color = payload.color
    member.emoji = payload.emoji
    update_fields = ["display_name", "color", "emoji"]
    if payload.completion_jingle is not None:
        _validate_completion_jingle(payload.completion_jingle)
        member.completion_jingle = payload.completion_jingle
        update_fields.append("completion_jingle")
    if payload.undo_jingle is not None:
        _validate_undo_jingle(payload.undo_jingle)
        member.undo_jingle = payload.undo_jingle
        update_fields.append("undo_jingle")
    if payload.pin is not None:
        _validate_pin(payload.pin)
        _ensure_pin_available(payload.pin, exclude_id=member.id)
        member.set_pin(payload.pin)
        update_fields.append("pin_hash")
    member.save(update_fields=update_fields)
    return member


@transaction.atomic
@router.put(
    "/household/manage-members/parents/{member_id}",
    response=ManagedMemberOut,
    auth=family_jwt_auth,
)
def update_parent_member(request, member_id: int, payload: ParentMemberUpdateIn):
    auth = require_parent(request)
    member = get_object_or_404(
        FamilyMember, id=member_id, household=auth.household, role=FamilyMember.Role.PARENT
    )
    display_name = payload.display_name.strip()
    email = payload.email.strip().lower()
    if not display_name or not email:
        raise HttpError(422, "Name und E-Mail-Adresse sind erforderlich.")
    if member.user_id is None:
        raise HttpError(422, "Für dieses Elternprofil fehlt ein Benutzerkonto.")
    if User.objects.filter(email__iexact=email).exclude(id=member.user_id).exists():
        raise HttpError(409, "Diese E-Mail-Adresse wird bereits verwendet.")

    member.user.email = email
    member.user.username = email
    member.user.save(update_fields=["email", "username"])
    member.display_name = display_name
    member.color = payload.color
    member.emoji = payload.emoji
    update_fields = ["display_name", "color", "emoji"]
    if payload.pin is not None:
        _validate_pin(payload.pin)
        _ensure_pin_available(payload.pin, exclude_id=member.id)
        member.set_pin(payload.pin)
        update_fields.append("pin_hash")
    member.save(update_fields=update_fields)
    return member
