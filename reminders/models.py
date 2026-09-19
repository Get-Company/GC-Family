from django.db import models


class Reminder(models.Model):
    class Kind(models.TextChoices):
        OPEN_TASKS = "OPEN_TASKS", "Offene Aufgaben"
        CHORE = "CHORE", "Bestimmte Aufgabe"
        MESSAGE = "MESSAGE", "Eigener Hinweis"

    member = models.ForeignKey("accounts.FamilyMember", on_delete=models.CASCADE, related_name="reminders")
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.OPEN_TASKS)
    chore = models.ForeignKey("chores.Chore", on_delete=models.CASCADE, null=True, blank=True)
    message = models.CharField(max_length=500, blank=True)
    time = models.TimeField()
    weekdays = models.JSONField(default=list, help_text="0=Montag bis 6=Sonntag")
    enabled = models.BooleanField(default=True)
    last_sent_at = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["time", "id"]


class ReminderDelivery(models.Model):
    """Ein Versand je Erinnerung und lokalem Kalendertag, auch nach Neustarts."""

    reminder = models.ForeignKey(Reminder, on_delete=models.CASCADE, related_name="deliveries")
    date = models.DateField()
    status = models.CharField(max_length=10, default="PENDING")
    attempts = models.PositiveSmallIntegerField(default=0)
    attempted_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["reminder", "date"], name="unique_reminder_delivery_per_day")]
