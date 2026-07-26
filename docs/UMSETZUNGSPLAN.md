# GC-Family — Umsetzungsplan / Handoff

> Fortsetzungsdokument. Fasst den aktuellen Stand zusammen und beschreibt die
> nächsten Phasen konkret genug, um ohne den bisherigen Chatverlauf weiterzuarbeiten.
> Ergänzt `docs/MVP-PLAN.md` (Gesamtbild) um den *aktuellen* Umsetzungsstand.

## Aktueller Stand (Phase 0–5 fertig)

**Commits (lokal, NOCH NICHT gepusht):**
- `88eff79` Initial commit
- `e96c81d` Phase 0: Scaffolding (Ninja, Next.js, Docker)
- `46c63db` Phase 1: Materialisierung, Chores-API, animiertes Dashboard

> ⚠️ **Push:** `git push origin master` wird vom Auto-Mode-Classifier blockiert —
> muss vom Nutzer selbst ausgeführt werden (`! git push origin master`).

**Stack:** Django 6 + Django Ninja · Next.js 16 (App Router, TS, Tailwind 4) in `frontend/` ·
Framer Motion · Web Audio · Postgres (Docker) / SQLite (lokal) · uv.

**Lokal starten:**
```bash
uv run python manage.py migrate
uv run python manage.py seed_demo          # Demo-Daten
uv run python manage.py runserver          # :8000
cd frontend && BACKEND_URL=http://127.0.0.1:8000 npm run dev   # :3000
```
**Docker:** `DJANGO_SECRET_KEY=… DB_PASSWORD=… docker compose up -d` (Postgres+Backend+Frontend).
**Demo-Login:** `eltern@gc-family.local` / `demo1234` · Kinder-PIN `1234`.

**Wichtige Dateien:**
- Backend: `accounts/models.py` (User/Household/FamilyMember), `chores/models.py`
  (Chore/RecurrenceRule/ChoreInstance), `chores/services.py` (Materialisierung),
  `chores/api.py` (Router), `gc_family/api.py` (NinjaAPI), `gc_family/settings.py` (env-basiert).
- Frontend: `src/app/page.tsx` (Dashboard), `src/components/TaskCard.tsx`,
  `src/lib/api.ts` (API-Client + Typen), `src/lib/useSound.ts` (Web Audio).
- Design: `design-system/gc-family/MASTER.md` (Flat Design, Blau+Grün, Baloo 2/Comic Neue).

**Bekannte Stolpersteine:**
- Next.js 16: Middleware heißt jetzt „Proxy". `rewrites` (next.config.ts) backt das
  `/api`-Ziel bei `output: standalone` zur **Build-Zeit** ein → `BACKEND_URL` als
  Build-ARG (docker-compose: `http://backend:8000`), nicht zur Laufzeit.
- Custom User (`accounts.User`, E-Mail-Login) wurde vor der ersten Auth-Migration gesetzt.
- Emoji nur als **Inhalts-Avatare** (Aufgaben/Mitglieder); UI-Steuerelemente sind SVG
  (Design-System-Regel „keine Emoji als UI-Icons").
- `chores/api.py` nutzt aktuell **den ersten Haushalt** (kein Auth) — Platzhalter bis Phase 2.

---

## Phasen-Status (Fortschritt)

```
Phase 0  ████████████████████  100%  ✅ fertig
Phase 1  ████████████████████  100%  ✅ fertig
Phase 2  ████████████████████  100%  ✅ fertig
Phase 3  ████████████████████  100%  ✅ fertig
Phase 4  ████████████████████  100%  ✅ fertig
Phase 5  ████████████████████  100%  ✅ fertig
```

**Aktueller Punkt: Ende Phase 5 — bereit für Commit/Deployment.**

### ✅ Phase 0 — Scaffolding (Commit `e96c81d`, fertig)
- [x] django-ninja/-jwt, corsheaders, whitenoise, psycopg via uv hinzugefügt
- [x] Apps `accounts` (Custom User E-Mail-Login, Household, FamilyMember mit Rolle/PIN) + `chores`
- [x] Settings env-basiert (SECRET_KEY/DEBUG/Hosts), Locale de/Europe-Berlin, Postgres/SQLite-Umschaltung, CORS
- [x] Ninja-API unter `/api` (`health`, `auth/me`, OpenAPI-Schema)
- [x] Next.js (App Router, TS, Tailwind) in `frontend/` mit `/api`-Rewrite-Proxy + Framer Motion
- [x] Docker: Backend- (uv+gunicorn) & Frontend-Image (standalone) + docker-compose mit Postgres
- [x] Verifiziert: kompletter Stack lief containerübergreifend, Migrationen gegen Postgres

### ✅ Phase 1 — Materialisierung, API & Dashboard (Commit `46c63db`, fertig)
- [x] `chores/services.py`: RecurrenceRule → ChoreInstance (DAILY/WEEKLY/MONTHLY, duplikatsicher)
- [x] Management-Commands `seed_demo` (Demo-Haushalt) + `materialize_chores` (Cron)
- [x] `/api/chores`-Router: `members`, `instances` (Zeitfenster/Filter), `complete`, `skip`
- [x] Design-System via ui-ux-pro-max → `design-system/gc-family/MASTER.md` angewandt
- [x] Animiertes Dashboard (Framer Motion): Staggered-Liste, Fortschritt, Mitglieder-Filter
- [x] `TaskCard` mit befriedigendem Abhaken (Spring-Check + Partikel-Burst)
- [x] `useSound`-Hook: akustisches Feedback (Web Audio) + Mute-Toggle, prefers-reduced-motion
- [x] Verifiziert: Prod-Build grün, HTTP 200, Daten via Proxy, `complete` → DONE

### ✅ Phase 2 — Auth & Mandantentrennung
- [x] Eltern-Login/Refresh via JWT sowie `FamilyJWTAuth` mit serverseitig aufgelöstem Mitgliedsprofil
- [x] `GET /api/auth/me`, geschützter Geräte-Kontext und PIN-Flow für kurzlebige Kinder-Tokens
- [x] Haushalt und Rollen aus Auth-Kontext; Kinder nur für eigene Aufgaben, CRUD/Skip nur für Eltern
- [x] OpenAPI → TypeScript-Typen via `npm run gen:types`
- [x] 7 Auth-/Mandanten-/CRUD-/Streak-Tests

### ✅ Phase 3 — Frontend: Login & Auth-Anbindung
- [x] `/login`: Eltern-Formular, Profilwahl und PIN-Pad
- [x] Session-Context mit Bearer-Headern, Refresh, 401-Redirect und getrenntem Geräte-Token
- [x] Geschütztes Dashboard mit Profilwechsel und Abmeldung

### ✅ Phase 4 — Eltern-Management `/manage`
- [x] Chore-CRUD-API (`POST/PUT/DELETE`, nur PARENT) mit sicherer Haushaltsprüfung und Re-Materialisierung
- [x] UI: Aufgaben-Liste sowie Anlege-/Bearbeiten-Formular für Serien und Einzelaufgaben
- [x] Zuweisung im MVP: **fixe Person pro Aufgabe**

### ✅ Phase 5 — Politur
- [x] Loading-/Empty-/Error-States, Animationen, Sound und sichtbare Fokuszustände
- [x] Responsive Layouts für Mobilgerät bis Desktop und tastaturbedienbare Formulare
- [x] Punkte-heute- und Tages-Streak-Anzeige
- [x] Produktions-Settings: erzwungener echter Secret-Key bei DEBUG=False, HTTPS-/Proxy-/HSTS-Optionen

### Nicht-Code-To-dos (Nutzer)
- [ ] `git push origin master` (Push wird vom Auto-Mode-Classifier blockiert)
- [ ] `docs/UMSETZUNGSPLAN.md` committen

---

## Phase 2 — Authentifizierung & Mandantentrennung

Ziel: echter Login, Haushalt kommt aus dem Auth-Kontext statt „erster Haushalt".

1. **Eltern-Login (JWT)** mit `django-ninja-jwt` (bereits installiert):
   - Controller/Router einbinden: `POST /api/auth/login` (E-Mail+Passwort → Access/Refresh-Token),
     `POST /api/auth/refresh`. Ninja-Auth-Klasse (`JWTAuth`) für geschützte Endpunkte.
   - `GET /api/auth/me` erweitern: liefert User + Household + FamilyMember-Profil.
2. **Kinder-PIN-Flow:**
   - `GET /api/household/{id}/members` (öffentlich für Profilauswahl auf einem Familiengerät)
     ODER Haushalt über einen geteilten „Geräte-Token".
   - `POST /api/auth/pin` (member_id + PIN) → prüft `FamilyMember.check_pin`,
     gibt einen **member-scoped Token** zurück (JWT mit member_id-Claim, kurze Laufzeit).
   - Entscheidung offen: Wie identifiziert das Familiengerät den Haushalt vor dem PIN?
     Vorschlag: Eltern loggen sich einmal am Gerät ein → Household-Kontext im Cookie/Storage;
     danach Profilauswahl+PIN für Kinder.
3. **Mandantentrennung:** `_current_household()` in `chores/api.py` ersetzen — Haushalt aus
   dem authentifizierten User/Member ableiten. Schreib-Endpunkte (Chore-CRUD) nur für Rolle PARENT.
4. **OpenAPI→TS-Typen generieren:** Schema unter `/api/openapi.json`. Tool wählen
   (`openapi-typescript`) und npm-Script `gen:types` anlegen, das `src/lib/api-types.ts` erzeugt.
   Danach die handgepflegten Typen in `src/lib/api.ts` durch generierte ersetzen.
5. **Verifizieren:** Login → Token → geschützter Abruf; PIN falsch/richtig; Rolle-Guards
   (Kind darf keine Chore anlegen). Tests in `chores/tests.py` / `accounts/tests.py`.

## Phase 3 — Frontend: Login & Auth-Anbindung

1. `/login`-Route: Eltern-Formular (E-Mail/Passwort) **+** Kinder-Profilauswahl
   (Kacheln mit Emoji/Farbe) mit **PIN-Pad** (animiert, mit `useSound`-Klick-Feedback).
2. Auth-State: Token in httpOnly-Cookie (bevorzugt) oder Context+Storage; `apiGet/apiPost`
   um `Authorization: Bearer` bzw. Cookie-Handling erweitern; 401 → Redirect `/login`.
3. Dashboard absichern (Redirect wenn nicht eingeloggt); „Wer ist das?"-Umschalter für Kinder.
4. Design-System anwenden (`design-system/gc-family/MASTER.md`), Animationen via `animate`-Skill,
   `prefers-reduced-motion` beachten. Für neue Seiten ggf. `design-system/gc-family/pages/<name>.md`.

## Phase 4 — Eltern-Management (`/manage`)

1. Chore-CRUD-API vervollständigen: `POST/PUT/DELETE /api/chores` (+ RecurrenceRule),
   nur PARENT. Beim Anlegen/Ändern einer Serie Instanzen neu materialisieren.
2. UI: Aufgaben-Liste (Serie vs. Einzelaufgabe), Anlege-/Bearbeiten-Formular mit
   Serien-Konfig (Frequenz, Intervall, Wochentage, Zuweisung, Punkte, Icon/Farbe).
   Formular-UX nach Design-System (sichtbare Labels, Inline-Validierung).
3. Zuweisungs-Rotation entscheiden (fix vs. reihum) — siehe offene Fragen unten.

## Phase 5 — Politur

Animations-Feinschliff, Sound-Set erweitern, Empty/Loading/Error-States, responsive
Prüfung (375/768/1024/1440), A11y (Fokus, Kontrast 4.5:1, Tastatur), Punkte/Streak-Anzeige.
Prod-Härtung: `DJANGO_DEBUG=False`, echter `DJANGO_SECRET_KEY`, `ALLOWED_HOSTS`, HTTPS/Reverse-Proxy.

---

## Offene Entscheidungen
- Haushalt-Identifikation am Familiengerät: Eltern-Login-Kontext; der Eltern-Access-Token bleibt separat als Geräte-Token.
- Token-Transport: Bearer-Tokens im `sessionStorage` plus React-Context (Token enden mit der Browser-Sitzung).
- Serien-Zuweisung: fixe Person; Rotation ist Backlog.
- Punkte/Belohnungen: im MVP nur anzeigen, Einlösung später (Backlog).

## Backlog (nach MVP)
Belohnungs-/Punkte-Ökonomie mit Einlösung, Push-Notifications, Kalender-Sync,
Mehr-Haushalt-Verwaltung, Foto-Nachweis, native App.

---

## Tech-Stack im Detail

### Backend
| Baustein | Wahl | Warum |
|----------|------|-------|
| Sprache/Runtime | Python 3.13 | aktuell, Typ-Hints |
| Framework | Django 6 | Admin, ORM, Auth, Migrationen out-of-the-box |
| API | **Django Ninja 1.6** (+ ninja-extra, django-ninja-jwt) | typisiert (Pydantic), automatisches OpenAPI-Schema, wenig Boilerplate |
| Auth | Custom User (`accounts.User`, E-Mail-Login) + JWT (Phase 2) | Eltern-Konto; Kinder via PIN-Hash auf `FamilyMember` |
| DB | Postgres 17 (Prod/Docker) · SQLite (lokal) | Umschaltung per `DB_HOST`-Env in `settings.py` |
| WSGI-Server | Gunicorn (3 Worker) | robuster Prod-Server |
| Static | WhiteNoise (CompressedManifest) | statische Auslieferung ohne separaten Webserver |
| Config | `python-dotenv`, env-basierte Settings | gleiche Konfig lokal/Server |
| Paketmanager | **uv** (uv.lock) | schnell, reproduzierbar |

### Frontend
| Baustein | Wahl | Warum |
|----------|------|-------|
| Framework | **Next.js 16** (App Router) | React 19, SSR/Routing, `rewrites`-Proxy für `/api` |
| Sprache | TypeScript | Typsicherheit, später generierte API-Typen |
| Styling | Tailwind CSS 4 + CSS-Variablen (Design-Tokens) | schnelle, konsistente UI |
| Animation | **Framer Motion** | Enter/Exit, Layout, Spring, Stagger |
| Sound | Web Audio API (`useSound`-Hook, synthetisiert) | akustisches Feedback ohne Assets |
| Fonts | Baloo 2 / Comic Neue (next/font) | kinderfreundlich (Design-System) |

### Infrastruktur
- **Docker**: Backend-Image (uv + gunicorn, Entrypoint: migrate+collectstatic),
  Frontend-Image (Next standalone), `docker-compose.yml` (Postgres + Backend + Frontend).
- Repo: `Get-Company/GC-Family` (GitHub, privat), Branch `master`.

---

## Verwendete Skills (in diesem Projekt)

| Skill | Wozu hier genutzt | Ergebnis |
|-------|-------------------|----------|
| **ui-ux-pro-max** | Design-System generieren (Palette, Typo, Motion, Anti-Patterns) | `design-system/gc-family/MASTER.md` — Flat Design, Blau+Grün, Baloo 2/Comic Neue |
| **animate** | Animationsmuster (Easing, Stagger, Spring, AnimatePresence, reduced-motion) | Dashboard-Animationen, `TaskCard`-Abhaken |

**Nutzungsmuster für Folgephasen:** Vor jeder neuen Seite `design-system/gc-family/MASTER.md`
lesen (ggf. `pages/<name>.md` als Override anlegen via `--page`). Für Animationen das
`animate`-Skill konsultieren; Golden Rules: nur `transform`/`opacity`, 200–300 ms,
Exit ~75 % der Enter-Dauer, `prefers-reduced-motion` respektieren.

---

## Skill-Empfehlungen

### Für Claude (Claude Code) — laufend nutzen
| Skill | Wann | Nutzen |
|-------|------|--------|
| **verify** | vor jedem Commit nicht-trivialer Änderungen | treibt den Flow real durch, statt nur Tests/Typecheck |
| **code-review** | nach einer Phase / vor Merge | findet Korrektheits-Bugs + Vereinfachungen im Diff |
| **simplify** | nach dem Schreiben größerer Blöcke | Reuse/Vereinfachung/Effizienz (nur Qualität) |
| **security-review** | vor Prod (Phase 5), da Auth/JWT/PIN | Sicherheitscheck der Änderungen |
| **ui-ux-pro-max** | jede neue Seite/Komponente | Design-Konsistenz, A11y-Checkliste |
| **animate** | jede Interaktion/Transition | performante, saubere Animationen |
| **dataviz** | falls Punkte/Streak-Charts kommen | konsistente, zugängliche Diagramme |
| **run** | App real starten/prüfen | Backend+Frontend hochfahren, Change bestätigen |

Zusätzlich (optional): **claude-mem** (`make-plan`/`do`) für phasenweise Ausführung
größerer Features; **fewer-permission-prompts** um wiederkehrende Freigaben zu reduzieren.

### Für OpenAI (Codex-Plugin, GPT-5.x)
Das lokale **codex**-Plugin delegiert an Codex/GPT — sinnvoll als *zweite Meinung*
und für zäh­e Fälle, parallel zu Claude:
| Skill/Agent | Wann einsetzen |
|-------------|----------------|
| **codex:rescue** (Agent `codex:codex-rescue`) | wenn ein Bug hartnäckig ist, ein zweiter Implementierungs-/Diagnose-Blick gewünscht ist, oder eine tiefere Root-Cause-Analyse nötig ist |
| **codex:setup** | einmalig prüfen, ob die Codex-CLI bereit ist (+ optionales Stop-Time-Review-Gate) |

**Arbeitsteilung-Empfehlung:** Claude für Feature-Umsetzung, UI/Animation, Reviews und
Verifikation; **Codex/OpenAI** gezielt für einen unabhängigen Diagnose-/Lösungsvorschlag
bei kniffligen Bugs oder Architekturfragen (Gegencheck), nicht als Standard-Pfad.

---

## Coding-Conventions (Stil-Leitfaden — bitte einhalten)

> Damit ein anderer Agent nahtlos im selben Stil weitermacht. Regeln aus dem
> bestehenden Code abgeleitet (`accounts/`, `chores/`, `frontend/src/`).

### Sprache
- **Bezeichner (Klassen/Funktionen/Variablen): Englisch.**
- **Docstrings, Kommentare, nutzersichtbare Strings: Deutsch** — inkl. `verbose_name`,
  `help_text`, Admin-Labels, Command-`help`/-Ausgaben, UI-Texte, Fehlermeldungen.
- **Git-Commits: Deutsch**, imperativ/thematisch; **kein** `Co-Authored-By`/`Claude-Session`-Trailer
  (geistiges Eigentum des Nutzers).
- Kommentare erklären das **Warum**, nicht das Offensichtliche.

### Python / Django
- **Double Quotes** durchgängig (auch wo Django-Default single quotes nutzt).
- `from __future__ import annotations` in Modulen mit Typ-Hints; moderne Hints
  (`list[X]`, `X | None`, `dt.date`). `import datetime as dt`.
- **Import-Reihenfolge** in Gruppen mit Leerzeile: stdlib → Django → third-party (ninja) → lokal.
- **Models:** `TextChoices` für Enums; Klassen-Docstring; `class Meta` (ordering/constraints);
  `__str__`; Hilfs-Properties/-Methoden am Model (z. B. `is_parent`, `set_pin`/`check_pin`
  via `make_password`/`check_password`). Geld/Logik nicht in Views.
- **Fachlogik in Service-Layer** (`chores/services.py`), nicht in Views/Models; modul-öffentliche
  Funktionen mit vollen Typ-Hints, private mit `_`-Präfix. Konstanten in GROSSBUCHSTABEN.
- **Ninja:** ein `Router` pro App (`chores/api.py`), zentral via `api.add_router(...)`
  in `gc_family/api.py` eingehängt. `Schema`-Klassen; berechnete Felder als
  `@staticmethod resolve_<feld>(obj)`. Endpunkte schlank, DB-Zugriff mit
  `select_related`, `get_object_or_404`.
- **Management-Commands:** `BaseCommand` mit `help`, `add_arguments`, `handle`;
  Ausgaben via `self.stdout.write(self.style.SUCCESS(...))`; **idempotent**
  (`get_or_create`); Schreiboperationen in `@transaction.atomic`.
- **Settings:** env-basiert über Helfer (`env_bool`, `env_list`, `os.getenv`).
- Formatierung/Linting: an Black/Ruff-Defaults orientieren (4 Spaces, ~88 Zeichen).

### TypeScript / React / Next.js
- `"use client"` als erste Zeile bei Client-Komponenten (State/Effekte/Browser-APIs).
- **Double Quotes, Semikolons, 2-Space-Indent** (Prettier/Next-Default).
- **`type`-Aliase** (keine `interface`) für Props und Datenformen; **discriminated unions**
  für Zustände (z. B. `{ kind: "loading" } | { kind: "ok"; … }`).
- Komponenten als **benannte Exports** (`export function TaskCard`), **Pages als default export**.
- Pfad-Alias **`@/`** für `src/`. API-Zugriff zentral in `src/lib/api.ts`
  (`apiGet<T>`/`apiPost<T>`, `ApiError`, exportierte Typen + Funktionen).
  Custom Hooks in `src/lib/` (Rückgabe als Objekt benannter Funktionen, z. B. `useSound`).
  Wiederverwendbare Komponenten in `src/components/`.
- **Framer Motion:** Easing-Konstante `const EASE_OUT = [0.23, 1, 0.32, 1] as const;`
  wiederverwenden; `initial/animate/transition`, `AnimatePresence` für Exits, `layout`,
  `whileTap`. Golden Rules: nur `transform`/`opacity`, 200–300 ms, Exit ~75 % der Enter-Dauer.
- **Design-Tokens** als CSS-Variablen (`var(--color-…)`, `var(--space-…)`, `var(--ease-…)`)
  aus `globals.css`; in `style`-Props/Tailwind referenzieren, **keine rohen Hex-Werte**
  in Komponenten (Ausnahme: dynamische Datenfarben wie `instance.color`).
- **A11y verpflichtend:** `aria-label`/`role`, sichtbare `focus-visible`-Ringe,
  `cursor-pointer` auf Klickbarem, `prefers-reduced-motion` respektiert (global in `globals.css`).
- Emoji nur als **Inhalts-Avatare**; UI-Steuerelemente als **inline-SVG** (Design-System-Regel).

### Workflow
- Neue Seite/Komponente: zuerst `design-system/gc-family/MASTER.md` (ggf. `pages/<name>.md`) lesen.
- Vor Commit nicht-trivialer Änderungen **real verifizieren** (Build + Flow durchspielen),
  nicht nur Typecheck. Temporärdateien in den Scratchpad, nicht ins Repo.
- Kein `node_modules`/`.venv`/`db.sqlite3`/`.next` committen (via `.gitignore` abgedeckt).
