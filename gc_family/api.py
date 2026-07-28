"""Zentrale Ninja-API-Instanz.

Router der einzelnen Apps werden hier registriert. Das OpenAPI-Schema ist unter
`/api/openapi.json` erreichbar und dient später zur Generierung der
TypeScript-Typen fürs Next.js-Frontend.
"""

from ninja import NinjaAPI, Schema

from accounts.api import router as accounts_router
from chores.api import public_router as public_chores_router
from chores.api import router as chores_router

api = NinjaAPI(title="GC-Family API", version="0.1.0")

api.add_router("/auth", accounts_router)
api.add_router("/chores", chores_router)
api.add_router("/public", public_chores_router)


class HealthOut(Schema):
    status: str
    service: str


@api.get("/health", response=HealthOut, tags=["system"])
def health(request):
    """Einfacher Health-Check für Monitoring und Frontend-Anbindung."""
    return {"status": "ok", "service": "gc-family"}
