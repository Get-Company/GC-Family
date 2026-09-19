"""Nur die mobilen Benachrichtigungsdienste des konfigurierten HA-Servers."""

from __future__ import annotations

import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from django.conf import settings


class HomeAssistantError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    # Verhindert, dass ein Redirect den Bearer-Token an einen anderen Host gibt.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def configured() -> bool:
    return bool(settings.HOME_ASSISTANT_URL and settings.HOME_ASSISTANT_TOKEN)


def request(path: str, payload: dict | None = None):
    if not configured():
        raise HomeAssistantError("Home Assistant ist noch nicht eingerichtet (Server-URL und Token fehlen).")
    url = settings.HOME_ASSISTANT_URL
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise HomeAssistantError("Die Home-Assistant-Server-URL ist ungültig.")
    req = Request(
        f"{url}/api/{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Authorization": f"Bearer {settings.HOME_ASSISTANT_TOKEN}", "Content-Type": "application/json"},
    )
    try:
        with build_opener(NoRedirect).open(req, timeout=10) as response:
            return json.load(response)
    except HTTPError as error:
        raise HomeAssistantError(f"Home Assistant antwortet mit HTTP {error.code}. Bitte Verbindung und Token prüfen.") from None
    except (URLError, TimeoutError, OSError, ValueError):
        raise HomeAssistantError("Home Assistant ist nicht erreichbar oder liefert eine ungültige Antwort.") from None


def valid_service(service: str) -> bool:
    return len(service) <= 160 and re.fullmatch(r"mobile_app_[a-z0-9_]+", service) is not None


def devices() -> list[dict[str, str]]:
    services = request("services")
    if not isinstance(services, list):
        raise HomeAssistantError("Home Assistant liefert keine gültige Geräteliste.")
    result = []
    for domain in services:
        if not isinstance(domain, dict) or domain.get("domain") != "notify":
            continue
        entries = domain.get("services", {})
        if not isinstance(entries, (dict, list)):
            continue
        for service in entries:
            if not isinstance(service, str) or not valid_service(service):
                continue
            details = entries.get(service, {}) if isinstance(entries, dict) else {}
            name = details.get("name") if isinstance(details, dict) else None
            result.append({"service": service, "name": name or service.removeprefix("mobile_app_").replace("_", " ")})
    return sorted(result, key=lambda device: device["name"].casefold())


def notify(service: str, message: str, tag: str) -> None:
    if not valid_service(service):
        raise HomeAssistantError("Für dieses Mitglied ist kein gültiges Handy ausgewählt.")
    data = {"tag": tag}
    if settings.GC_FAMILY_PUBLIC_URL:
        data.update({"url": settings.GC_FAMILY_PUBLIC_URL, "clickAction": settings.GC_FAMILY_PUBLIC_URL})
    request(f"services/notify/{service}", {"title": "GC-Family", "message": message, "data": data})
