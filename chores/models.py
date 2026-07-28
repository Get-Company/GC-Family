from django.db import models

from accounts.models import FamilyMember, Household, User


class Chore(models.Model):
    """Aufgaben-*Definition*.

    - Serie (z. B. Staubsaugen, Spülmaschine): `is_recurring=True` mit
      zugehöriger `RecurrenceRule`.
    - Einzelaufgabe (z. B. Wertstoffhof, Papier): `is_recurring=False`,
      genau eine `ChoreInstance` an einem Datum.
    """

    household = models.ForeignKey(
        Household,
        on_delete=models.CASCADE,
        related_name="chores",
    )
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=8, blank=True, help_text="Emoji-Icon")
    color = models.CharField(max_length=7, default="#6366f1")
    image = models.FileField(
        upload_to="chore-images/",
        blank=True,
        help_text="Optionales Bild zur Aufgabe.",
    )
    points = models.PositiveIntegerField(default=0)
    is_recurring = models.BooleanField(default=False)
    default_assignee = models.ForeignKey(
        FamilyMember,
        on_delete=models.SET_NULL,
        related_name="default_chores",
        null=True,
        blank=True,
    )
    default_assignees = models.ManyToManyField(
        FamilyMember,
        related_name="default_chores_multi",
        blank=True,
        help_text="Kinder, die gemeinsam für diese Aufgabe zuständig sind.",
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name="created_chores",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["title"]

    def __str__(self):
        return self.title


class RecurrenceRule(models.Model):
    """Wiederholungsregel einer Serien-Aufgabe."""

    class Frequency(models.TextChoices):
        DAILY = "DAILY", "Täglich"
        WEEKLY = "WEEKLY", "Wöchentlich"
        MONTHLY = "MONTHLY", "Monatlich"

    chore = models.OneToOneField(
        Chore,
        on_delete=models.CASCADE,
        related_name="recurrence",
    )
    frequency = models.CharField(max_length=10, choices=Frequency.choices)
    interval = models.PositiveSmallIntegerField(
        default=1,
        help_text="Alle N Einheiten, z. B. 2 = jede zweite Woche.",
    )
    weekdays = models.JSONField(
        default=list,
        blank=True,
        help_text="Wochentage bei WEEKLY (0=Mo … 6=So), z. B. [0, 3].",
    )
    day_of_month = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Tag im Monat bei MONTHLY (1–31).",
    )
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.chore.title}: {self.get_frequency_display()} (×{self.interval})"


class ChoreInstance(models.Model):
    """Konkrete Aufgabe an einem Tag (materialisiert aus Definition/Regel)."""

    class Status(models.TextChoices):
        OPEN = "OPEN", "Offen"
        PARTIAL = "PARTIAL", "Wird gemeinsam erledigt"
        DONE = "DONE", "Erledigt"
        SKIPPED = "SKIPPED", "Übersprungen"

    chore = models.ForeignKey(
        Chore,
        on_delete=models.CASCADE,
        related_name="instances",
    )
    due_date = models.DateField()
    active_until = models.DateField(
        null=True,
        blank=True,
        help_text="Optionales Ende eines Zeitraums für einmalige Aufgaben.",
    )
    assigned_member = models.ForeignKey(
        FamilyMember,
        on_delete=models.SET_NULL,
        related_name="assigned_instances",
        null=True,
        blank=True,
    )
    assigned_members = models.ManyToManyField(
        FamilyMember,
        related_name="assigned_instances_multi",
        blank=True,
        help_text="Kinder, denen diese konkrete Aufgabe zugeordnet ist.",
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.OPEN,
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        FamilyMember,
        on_delete=models.SET_NULL,
        related_name="completed_instances",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["due_date", "chore__title"]
        constraints = [
            models.UniqueConstraint(
                fields=["chore", "due_date"],
                name="unique_chore_instance_per_day",
            )
        ]

    def __str__(self):
        return f"{self.chore.title} @ {self.due_date} [{self.get_status_display()}]"


class ChoreContribution(models.Model):
    """Der Anteil eines Kindes an einer Aufgaben-Instanz.

    Eine Aufgabe wird entweder allein (Anteil 1,0) oder von genau zwei Kindern
    geteilt (je Anteil 0,5) erledigt. Der Team-Bonus wird bei der Auswertung
    berechnet und nicht als veränderlicher Punktestand gespeichert.
    """

    instance = models.ForeignKey(
        ChoreInstance,
        on_delete=models.CASCADE,
        related_name="contributions",
    )
    member = models.ForeignKey(
        FamilyMember,
        on_delete=models.CASCADE,
        related_name="chore_contributions",
    )
    share = models.DecimalField(max_digits=3, decimal_places=2)
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["instance", "member"],
                name="unique_chore_contribution_per_member",
            )
        ]
        ordering = ["completed_at"]

    def __str__(self):
        return f"{self.member.display_name}: {self.share} von {self.instance}"
