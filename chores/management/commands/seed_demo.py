"""Legt einen Demo-Haushalt mit Mitgliedern und typischen Aufgaben an.

Idempotent: mehrfaches Ausführen erzeugt keine Dubletten. Mit --reset werden
die Demo-Aufgaben zuvor entfernt.
"""

import datetime as dt

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import FamilyMember, Household, User
from chores.models import Chore, ChoreInstance, RecurrenceRule
from chores.services import materialize_household

DEMO_EMAIL = "eltern@gc-family.local"
DEMO_HOUSEHOLD = "Familie Muster"


class Command(BaseCommand):
    help = "Seedet einen Demo-Haushalt mit Mitgliedern und Aufgaben."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Bestehende Demo-Aufgaben/Instanzen vorher löschen.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        parent_user, _ = User.objects.get_or_create(
            email=DEMO_EMAIL,
            defaults={"username": DEMO_EMAIL, "is_staff": True},
        )
        parent_user.set_password("demo1234")
        parent_user.save()

        household, _ = Household.objects.get_or_create(
            name=DEMO_HOUSEHOLD,
            defaults={"owner": parent_user},
        )

        # Mitglieder
        mama, _ = FamilyMember.objects.get_or_create(
            household=household,
            display_name="Mama",
            defaults={
                "role": FamilyMember.Role.PARENT,
                "user": parent_user,
                "color": "#2563EB",
                "emoji": "👩",
            },
        )
        papa, _ = FamilyMember.objects.get_or_create(
            household=household,
            display_name="Papa",
            defaults={"role": FamilyMember.Role.PARENT, "color": "#059669", "emoji": "👨"},
        )
        emma, _ = FamilyMember.objects.get_or_create(
            household=household,
            display_name="Emma",
            defaults={"role": FamilyMember.Role.CHILD, "color": "#D97706", "emoji": "🧒"},
        )
        emma.set_pin("1234")
        emma.save()
        leon, _ = FamilyMember.objects.get_or_create(
            household=household,
            display_name="Leon",
            defaults={"role": FamilyMember.Role.CHILD, "color": "#7C3AED", "emoji": "👦"},
        )
        leon.set_pin("1234")
        leon.save()

        if options["reset"]:
            household.chores.all().delete()

        today = dt.date.today()

        # --- Serien-Aufgaben (wiederkehrend) ---
        self._recurring(
            household, parent_user, emma,
            title="Spülmaschine ausräumen", icon="🍽️", color="#2563EB", points=5,
            frequency=RecurrenceRule.Frequency.DAILY, interval=1, start=today,
        )
        self._recurring(
            household, parent_user, leon,
            title="Staubsaugen", icon="🧹", color="#059669", points=10,
            frequency=RecurrenceRule.Frequency.WEEKLY, interval=1,
            weekdays=[5], start=today,  # samstags
        )
        self._recurring(
            household, parent_user, papa,
            title="Bad putzen", icon="🚿", color="#7C3AED", points=15,
            frequency=RecurrenceRule.Frequency.WEEKLY, interval=1,
            weekdays=[6], start=today,  # sonntags
        )

        # --- Einzelaufgaben ---
        self._one_off(
            household, parent_user, papa,
            title="Wertstoffhof", icon="♻️", color="#D97706", points=20,
            due_date=today + dt.timedelta(days=2),
        )
        self._one_off(
            household, parent_user, mama,
            title="Papiertonne rausstellen", icon="🗑️", color="#DC2626", points=5,
            due_date=today + dt.timedelta(days=1),
        )

        created = materialize_household(household)

        self.stdout.write(
            self.style.SUCCESS(
                f"Demo-Haushalt '{household.name}' bereit — "
                f"{household.members.count()} Mitglieder, "
                f"{household.chores.count()} Aufgaben, "
                f"{len(created)} Serien-Instanzen materialisiert.\n"
                f"Login (Eltern): {DEMO_EMAIL} / demo1234 · Kinder-PIN: 1234"
            )
        )

    def _recurring(
        self, household, creator, assignee, *, title, icon, color, points,
        frequency, interval, start, weekdays=None, day_of_month=None,
    ):
        chore, created = Chore.objects.get_or_create(
            household=household,
            title=title,
            defaults={
                "icon": icon, "color": color, "points": points,
                "is_recurring": True, "default_assignee": assignee,
                "created_by": creator,
            },
        )
        if created:
            RecurrenceRule.objects.create(
                chore=chore,
                frequency=frequency,
                interval=interval,
                weekdays=weekdays or [],
                day_of_month=day_of_month,
                start_date=start,
            )
        return chore

    def _one_off(
        self, household, creator, assignee, *, title, icon, color, points, due_date,
    ):
        chore, created = Chore.objects.get_or_create(
            household=household,
            title=title,
            defaults={
                "icon": icon, "color": color, "points": points,
                "is_recurring": False, "default_assignee": assignee,
                "created_by": creator,
            },
        )
        if created:
            ChoreInstance.objects.get_or_create(
                chore=chore,
                due_date=due_date,
                defaults={"assigned_member": assignee},
            )
        return chore
