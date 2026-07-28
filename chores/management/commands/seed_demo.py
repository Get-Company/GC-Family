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

DEMO_EMAIL = "mama@gc-family.local"
PAPA_EMAIL = "papa@gc-family.local"
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
            defaults={
                "username": DEMO_EMAIL,
                "is_staff": False,
                "is_superuser": False,
            },
        )
        parent_user.set_password("demo1234")
        parent_user.is_staff = False
        parent_user.is_superuser = False
        parent_user.save(update_fields=["password", "is_staff", "is_superuser"])

        household, _ = Household.objects.get_or_create(
            name=DEMO_HOUSEHOLD,
            defaults={"owner": parent_user},
        )

        # Mitglieder
        mama, _ = FamilyMember.objects.get_or_create(
            household=household,
            user=parent_user,
            defaults={
                "role": FamilyMember.Role.PARENT,
                "display_name": "Susi",
                "color": "#2563EB",
                "emoji": "👩",
            },
        )
        mama.display_name, mama.role, mama.color, mama.emoji = "Susi", FamilyMember.Role.PARENT, "#2563EB", "👩"
        mama.set_pin("111111")
        mama.save()
        papa_user, _ = User.objects.get_or_create(
            email=PAPA_EMAIL,
            defaults={"username": PAPA_EMAIL, "is_staff": True, "is_superuser": True},
        )
        papa_user.set_password("demo1234")
        papa_user.is_staff = True
        papa_user.is_superuser = True
        papa_user.save(update_fields=["password", "is_staff", "is_superuser"])
        papa = household.members.filter(
            display_name="Florian", role=FamilyMember.Role.PARENT
        ).first()
        if papa is None:
            papa, _ = FamilyMember.objects.get_or_create(
                household=household,
                user=papa_user,
                defaults={"role": FamilyMember.Role.PARENT},
            )
        else:
            papa.user = papa_user
        papa.display_name, papa.role, papa.color, papa.emoji = "Florian", FamilyMember.Role.PARENT, "#059669", "👨"
        papa.set_pin("222222")
        papa.save()
        anna = household.members.filter(display_name__in=["Emma", "Anna"]).first()
        if anna is None:
            anna = FamilyMember.objects.create(household=household, role=FamilyMember.Role.CHILD)
        anna.display_name, anna.role, anna.color, anna.emoji = "Anna", FamilyMember.Role.CHILD, "#D97706", "🧒"
        anna.set_pin("123456")
        anna.save()
        florian_x = household.members.filter(display_name__in=["Leon", "Florian X"]).first()
        if florian_x is None:
            florian_x = FamilyMember.objects.create(household=household, role=FamilyMember.Role.CHILD)
        florian_x.display_name, florian_x.role, florian_x.color, florian_x.emoji = "Florian X", FamilyMember.Role.CHILD, "#7C3AED", "👦"
        florian_x.set_pin("654321")
        florian_x.save()

        if options["reset"]:
            household.chores.all().delete()

        today = dt.date.today()

        # --- Serien-Aufgaben (wiederkehrend) ---
        self._recurring(
            household, parent_user, anna,
            title="Spülmaschine ausräumen", icon="🍽️", color="#2563EB", points=5,
            frequency=RecurrenceRule.Frequency.DAILY, interval=1, start=today,
        )
        self._recurring(
            household, parent_user, florian_x,
            title="Staubsaugen", icon="🧹", color="#059669", points=10,
            frequency=RecurrenceRule.Frequency.WEEKLY, interval=1,
            weekdays=[5], start=today,  # samstags
        )
        self._recurring(
            household, parent_user, anna,
            title="Bad putzen", icon="🚿", color="#7C3AED", points=15,
            frequency=RecurrenceRule.Frequency.WEEKLY, interval=1,
            weekdays=[6], start=today,  # sonntags
        )

        # --- Einzelaufgaben ---
        self._one_off(
            household, parent_user, florian_x,
            title="Wertstoffhof", icon="♻️", color="#D97706", points=20,
            due_date=today + dt.timedelta(days=2),
        )
        self._one_off(
            household, parent_user, anna,
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
                "PIN-Login: Susi 111111 · Florian 222222 · Anna 123456 · Florian X 654321\n"
                f"Django-Backend (nur Florian): {PAPA_EMAIL} / demo1234"
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
        else:
            chore.default_assignee = assignee
            chore.save(update_fields=["default_assignee"])
            chore.instances.filter(status=ChoreInstance.Status.OPEN).update(assigned_member=assignee)
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
        else:
            chore.default_assignee = assignee
            chore.save(update_fields=["default_assignee"])
            chore.instances.filter(status=ChoreInstance.Status.OPEN).update(assigned_member=assignee)
        return chore
