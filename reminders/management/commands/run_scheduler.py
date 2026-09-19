import time

from django.core.management.base import BaseCommand
from django.db import OperationalError, ProgrammingError, close_old_connections
from django.utils import timezone

from accounts.models import Household
from chores.services import materialize_household
from reminders.services import send_due_reminders


class Command(BaseCommand):
    help = "Materialisiert Aufgaben und versendet fällige Home-Assistant-Erinnerungen."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Ein Durchlauf, z. B. für Cron.")

    def handle(self, *args, **options):
        last_materialized = None
        while True:
            try:
                close_old_connections()
                today = timezone.localdate()
                if today != last_materialized:
                    for household in Household.objects.all():
                        materialize_household(household, start=today, horizon_days=21)
                    last_materialized = today
                sent = send_due_reminders()
                if sent:
                    self.stdout.write(f"{sent} Erinnerung(en) versendet.")
            except (OperationalError, ProgrammingError):
                # Backend führt beim Containerstart die Migrationen aus.
                if options["once"]:
                    raise
                self.stderr.write("Warte auf Datenbank und Migrationen …")
            if options["once"]:
                return
            time.sleep(30)
