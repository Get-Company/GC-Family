"""Zentrale Ninja-API-Instanz.

Router der einzelnen Apps werden hier registriert. Das OpenAPI-Schema ist unter
`/api/openapi.json` erreichbar und dient später zur Generierung der
TypeScript-Typen fürs Next.js-Frontend.
"""

from ninja import NinjaAPI, Schema

api = NinjaAPI(title="GC-Family API", version="0.1.0")


class HealthOut(Schema):
    status: str
    service: str


@api.get("/health", response=HealthOut, tags=["system"])
def health(request):
    """Einfacher Health-Check für Monitoring und Frontend-Anbindung."""
    return {"status": "ok", "service": "gc-family"}


class MeOut(Schema):
    authenticated: bool
    email: str | None = None


@api.get("/auth/me", response=MeOut, tags=["auth"])
def me(request):
    """Aktueller Nutzer. Wird in Phase 2 um echtes JWT/PIN-Auth erweitert."""
    user = getattr(request, "user", None)
    if user and user.is_authenticated:
        return {"authenticated": True, "email": user.email}
    return {"authenticated": False, "email": None}
