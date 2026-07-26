"""Ninja-Router für Login, Token-Erneuerung und Geräte-Kontext."""

from __future__ import annotations

from django.contrib.auth import authenticate
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


class HouseholdOut(Schema):
    id: int
    name: str


class UserOut(Schema):
    id: int
    email: str


class MeOut(Schema):
    authenticated: bool
    user: UserOut | None = None
    household: HouseholdOut
    member: MemberOut


class LoginIn(Schema):
    email: str
    password: str


class PinIn(Schema):
    member_id: int
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
    }


def _token_pair(user: User, member: FamilyMember) -> dict[str, str]:
    """Erstellt ein Refresh-/Access-Paar mit serverseitig geprüfter Mitgliedschaft."""
    refresh = RefreshToken.for_user(user)
    refresh["member_id"] = member.id
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


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
        user = {"id": auth.member.user_id, "email": auth.member.user.email}
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

    token = AccessToken()
    token["member_id"] = member.id
    return {"access": str(token)}
