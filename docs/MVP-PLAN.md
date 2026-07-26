# GC-Family — MVP-Plan: Haushaltsaufgaben

> Familien-App. Erstes Feature: Haushaltsaufgaben. Eltern geben Aufgaben vor
> (Serien wie Staubsaugen/Spülmaschine + Einzelaufgaben wie Wertstoffhof/Papier),
> Familienmitglieder erledigen sie mit viel Animation & akustischem Feedback.

## 1. Stack

| Schicht      | Technologie |
|--------------|-------------|
| Backend      | Django 6, **Django Ninja** (typisierte API, OpenAPI-Schema) |
| DB           | SQLite (Dev) → später Postgres |
| Frontend     | **Next.js (App Router) + TypeScript** in `frontend/` |
| Animation    | Framer Motion / GSAP (via `animate`-Skill) |
| Design       | `ui-ux-pro-max`-Skill (Palette, Typo, Komponenten) |
| Sound        | Web Audio API (kleiner `useSound`-Hook) |
| Auth         | Eltern: E-Mail+Passwort (JWT). Kinder: Profil + PIN |
| Typ-Sharing  | OpenAPI-Schema → generierte TS-Typen fürs Frontend |

## 2. Domänenmodell

Neue Django-Apps: **`accounts`** (Identität) und **`chores`** (Aufgaben).
Die leere App `GCFamily` wird durch diese abgelöst.

### accounts
- **User** (custom, `AUTH_USER_MODEL`) — Eltern-Login via E-Mail. *Jetzt* einführen,
  solange noch keine Auth-Migration existiert (Best Practice).
- **Household** — die Familie. `name`, `owner (User)`.
- **FamilyMember** — Profil im Haushalt.
  `household FK`, `display_name`, `role` (`PARENT`/`CHILD`), `color`, `avatar/emoji`,
  `user FK` (nullable, gesetzt bei Eltern), `pin_hash` (nullable, für Kinder).

### chores
- **Chore** — die Aufgaben-*Definition*.
  `household`, `title`, `description`, `icon`, `color`, `points` (optional),
  `is_recurring` (bool), `created_by`, `default_assignee (FamilyMember, nullable)`.
- **RecurrenceRule** — nur bei `is_recurring`. `chore (1:1)`,
  `frequency` (`DAILY`/`WEEKLY`/`MONTHLY`), `interval` (z. B. alle 2 Wochen),
  `weekdays` (Liste, bei WEEKLY), `day_of_month` (bei MONTHLY),
  `start_date`, `end_date` (nullable).
- **ChoreInstance** — konkrete Aufgabe an einem Tag (materialisiert).
  `chore`, `due_date`, `assigned_member`, `status` (`OPEN`/`DONE`/`SKIPPED`),
  `completed_at`, `completed_by`.

**Serien-Materialisierung:** Ein Service erzeugt `ChoreInstance`-Zeilen für ein
rollierendes Fenster (z. B. nächste 14 Tage) aus den `RecurrenceRule`s.
Einzelaufgaben (Wertstoffhof/Papier) = `Chore` mit `is_recurring=False` und genau
einer Instanz an einem Datum. Aufruf via Management-Command + on-demand beim Laden.

## 3. API (Django Ninja, `/api`)

**Auth**
- `POST /auth/login` → JWT (Eltern)
- `POST /auth/pin` → member-scoped Token (Kind wählt Profil + PIN)
- `GET  /auth/me`

**Haushalt & Mitglieder**
- `GET  /household` · `GET/POST /household/members` (Schreiben: nur Eltern)

**Chores**
- `GET/POST /chores`, `PUT/DELETE /chores/{id}` (Schreiben: nur Eltern)
- `GET  /chores/instances?from=&to=&member=` — Tages-/Wochenliste
- `POST /chores/instances/{id}/complete`
- `POST /chores/instances/{id}/skip`

## 4. Frontend (Next.js)

**Seiten**
- `/login` — Eltern-Login **+** Kinder-Profilauswahl mit PIN-Pad.
- `/` — Dashboard: heutige Aufgaben (pro Mitglied / „meine"), großes
  befriedigendes Abhaken (Animation + Sound), Fortschritt/Streak.
- `/manage` — Eltern: Chores anlegen/bearbeiten, Serien konfigurieren
  (Frequenz, Wochentage, Zuweisung).

**Interaktion & Feel**
- `animate`-Skill: Micro-Interactions, Check-Animation, Listenübergänge, Modals.
- `useSound`-Hook (Web Audio): „Ding" beim Erledigen, Klick/Toggle, sanfter Error.
  Global stumm­schaltbar; respektiert `prefers-reduced-motion`.
- `ui-ux-pro-max`: Farbpalette, Typo-Pairing, Komponenten-Stil (familienfreundlich,
  verspielt, hoher Kontrast, mobil zuerst).

## 5. Umsetzung in Phasen

- **Phase 0 – Scaffolding**
  Django Ninja einbinden; `accounts`/`chores`-Apps; **Custom User** + `AUTH_USER_MODEL`
  vor erster Migration; `.env`/Settings aufräumen (SECRET_KEY, DEBUG, CORS/Hosts).
  Next.js in `frontend/`; Dev-Proxy (`/api` → Django); OpenAPI→TS-Typgenerierung.
- **Phase 1 – Datenmodell**
  Modelle, Migrationen, Django-Admin, Seed-/Demo-Daten. Materialisierungs-Service +
  Management-Command.
- **Phase 2 – API & Auth**
  Ninja-Router, JWT (Eltern) + PIN-Flow (Kinder), Rollen-/Rechteprüfung, Schema-Export.
- **Phase 3 – Frontend-Kern**
  Auth-Flow, Dashboard, Aufgabenliste, Abhaken mit Animation + Sound. Erste Runde
  `ui-ux-pro-max`-Design.
- **Phase 4 – Eltern-Management**
  Chore anlegen/bearbeiten, Serien-Konfig (Serie vs. Einzelaufgabe), Zuweisung.
- **Phase 5 – Politur**
  Animationsschliff, Sound-Set, Empty States, Responsive, Zugänglichkeit
  (`prefers-reduced-motion`, Fokus, Kontrast).

## 6. MVP-Grenze (was NICHT rein muss)

Belohnungs-/Punkte-Ökonomie mit Einlösung, Push-Notifications, Kalender-Sync,
Mehr-Haushalt-Verwaltung, Foto-Nachweis, native App. → Backlog nach MVP.

## 7. Offene Detailfragen (später)

- Rotation der Zuweisung bei Serien (fix vs. reihum)?
- Punkte/Belohnungen schon im MVP sichtbar, aber ohne Einlösung?
- Zeitzone/Locale: `de` + `Europe/Berlin` setzen.
