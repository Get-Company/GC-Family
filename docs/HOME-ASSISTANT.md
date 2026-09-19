# Erinnerungen über Home Assistant

GC-Family lädt die `notify.mobile_app_*`-Dienste aus Home Assistant. Ein Elternteil
wählt unter **Verwalten → Mitglieder** das Handy für jedes Familienprofil aus.
Unter **Verwalten → Erinnerungen** lassen sich Uhrzeit, Wochentage, Empfänger und
Inhalt anlegen, bearbeiten, pausieren und löschen.

## Einmalige Einrichtung auf dem Server

1. Die Home-Assistant-Companion-App muss auf den Handys angemeldet sein und
   Benachrichtigungen erlauben. Die Handys müssen in Home Assistant einen
   `notify.mobile_app_*`-Dienst besitzen; ein reiner Geräte-Tracker reicht nicht.
2. Im Home-Assistant-Profil einen langlebigen Zugriffstoken erstellen.
3. In der `.env` des GC-Family-Servers ergänzen:

   ```dotenv
   HOME_ASSISTANT_URL=http://homeassistant.local:8123
   HOME_ASSISTANT_TOKEN=hier-den-token-eintragen
   GC_FAMILY_PUBLIC_URL=https://familie.example.de
   ```

   Die HA-Adresse muss aus den Backend- und Scheduler-Containern erreichbar sein.
   Bei Bedarf statt des lokalen Hostnamens die LAN-IP verwenden. Die öffentliche
   App-URL ist optional; sie öffnet beim Tippen auf die Nachricht die Aufgaben.
   Zugangstoken gehören ausschließlich in die nicht versionierte `.env`.
4. `docker compose --env-file .env up -d --build` ausführen. Der vorhandene
   Scheduler materialisiert weiterhin Aufgaben und prüft jetzt alle 30 Sekunden
   die Erinnerungen. Die Datenbankmigrationen führt der Backend-Start aus.
5. In der Mitgliederverwaltung **Geräte neu laden**, Handys auswählen und bei
   Bedarf **Testnachricht senden** verwenden.

## Verhalten

- **Offene Aufgaben:** nennt aktuell verfügbare eigene und freie Aufgaben sowie
  offene Team-Anteile. Bereits selbst übernommene Anteile werden ausgelassen.
- **Bestimmte Aufgabe:** erinnert nur, wenn diese Aufgabe für das ausgewählte
  Mitglied verfügbar und noch offen ist.
- **Eigener Hinweis:** sendet den eingetragenen Text unabhängig von Aufgaben.
- Uhrzeiten gelten in **Europe/Berlin**, einschließlich Sommer-/Winterzeit.
- Ein Versand wird je Erinnerung und lokalem Kalendertag gespeichert. Normale
  wiederholte Scheduler-Läufe und Neustarts senden denselben Tagesversand nicht
  erneut. Bei Verbindungsfehlern gibt es höchstens drei Versuche, mit mindestens
  einer Minute Abstand und innerhalb von 15 Minuten nach dem Termin. Ein stabiler
  Benachrichtigungs-Tag lässt Wiederholungen auf dem Handy dieselbe Meldung ersetzen.
- Verpasste Termine außerhalb dieser 15 Minuten werden nicht nachträglich gesendet.
  Ein Absturz unmittelbar zwischen HA-Zustellung und Datenbank-Commit kann einen
  erneuten Zustellversuch auslösen; externe Push-Zustellung bietet kein Exactly-once.
- Ohne offene Aufgaben wird der Termin als ausgelassen gespeichert. Wird später
  eine Aufgabe wieder geöffnet, folgt der nächste reguläre Erinnerungstermin.
- Ein fehlendes Handy oder eine gestörte HA-Verbindung wird als Versandfehler in
  der Erinnerungsübersicht angezeigt. **Status aktualisieren** lädt den letzten Stand.
- Änderungen am Zeitplan lösen keinen zweiten Versand am selben Tag aus, wenn die
  Erinnerung an diesem Tag bereits gesendet oder mangels Aufgaben ausgelassen wurde.

Lokal: `python manage.py run_scheduler`; für einen einzelnen Durchlauf oder einen
externen Minutentakt: `python manage.py run_scheduler --once`.

Offizielle Schnittstellen: [Home Assistant REST API](https://developers.home-assistant.io/docs/api/rest/)
und [Companion-App-Benachrichtigungen](https://companion.home-assistant.io/docs/notifications/notifications-basic/).

## Aufgaben und Scoreboard

Die Startseite zeigt eine Kachel je Aufgaben-Definition. Aktuelle Aufgaben stehen
vor inaktiven; Details werden mit der Liste geladen. Erledigte Aufgaben bleiben
mit Erledigungszeit und Beteiligten sichtbar, wiederkehrende Aufgaben zeigen den
nächsten Termin. Neue Instanzen werden auch beim Aufruf der Liste materialisiert.

Die Wertungen gelten für die laufende Familienwoche (Sonntag bis Samstag), den
aktuellen Kalendermonat und die gesamte Zeit. Entscheidend ist das Erledigungsdatum
in Europe/Berlin; alte Einträge ohne Erledigungszeit verwenden ihr Aufgabendatum.
Team-Anteile behalten ihren 20-Prozent-Bonus, Punktgleichstände teilen sich den Rang.
