"""JWT-Authentifizierung und Autorisierungshelfer für Familienmitglieder."""

from __future__ import annotations

from dataclasses import dataclass

from ninja.errors import HttpError
from ninja.security import HttpBearer
from ninja_jwt.exceptions import TokenError
from ninja_jwt.tokens import AccessToken

from accounts.models import FamilyMember, Household


@dataclass(frozen=True)
class AuthContext:
    """Die aus einem gültigen Token ermittelte Person und ihr Haushalt."""

    member: FamilyMember
    household: Household

    @property
    def is_parent(self) -> bool:
        return self.member.is_parent


class FamilyJWTAuth(HttpBearer):
    """Prüft GC-Family-Tokens und löst deren Mitgliedschaft serverseitig auf."""

    def authenticate(self, request, token: str) -> AuthContext | None:
        try:
            payload = AccessToken(token)
        except TokenError:
            return None

        member_id = payload.get("member_id")
        if not isinstance(member_id, int):
            return None

        member = (
            FamilyMember.objects.select_related("household")
            .filter(id=member_id)
            .first()
        )
        if member is None:
            return None

        if member.is_parent and member.user_id != payload.get("user_id"):
            return None

        return AuthContext(member=member, household=member.household)


family_jwt_auth = FamilyJWTAuth()


def current_auth(request) -> AuthContext:
    """Liefert den durch den Router bereits geprüften Auth-Kontext."""
    return request.auth


def require_parent(request) -> AuthContext:
    """Bricht ab, wenn das angemeldete Mitglied keine Elternrolle besitzt."""
    auth = current_auth(request)
    if not auth.is_parent:
        raise HttpError(403, "Diese Aktion ist nur für Eltern erlaubt.")
    return auth
