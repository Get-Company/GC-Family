"""Materialisiert Serien-Aufgaben in konkrete Instanzen für alle Haushalte.

Idealerweise per Cron/geplantem Task täglich ausführen, damit stets ein
Vorlauf-Fenster an offenen Aufgaben existiert.
"""

from django.core.management.base import BaseCommand

from accounts.models import Household
from chores.services import DEFAULT_HORIZON_DAYS, materialize_household


class Command(BaseCommand):
    help = "Erzeugt ChoreInstances aus Serien-Regeln für ein Vorlauf-Fenster."

    def add_arguments(self, parser):
        parser.add_argument(
            "--horizon",
            type=int,
            default=DEFAULT_HORIZON_DAYS,
            help=f"Anzahl Tage im Voraus (Default {DEFAULT_HORIZON_DAYS}).",
        )

    def handle(self, *args, **options):
        horizon = options["horizon"]
        total = 0
        for household in Household.objects.all():
            created = materialize_household(household, horizon_days=horizon)
            total += len(created)
            self.stdout.write(
                f"  {household.name}: {len(created)} neue Instanzen"
            )
        self.stdout.write(
            self.style.SUCCESS(f"Fertig — {total} neue Instanzen materialisiert.")
        )
