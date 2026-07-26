from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import UserManager


class User(AbstractUser):
    """Vollwertiges Konto — genutzt von Eltern (Login per E-Mail + Passwort).

    E-Mail ist der Login-Identifikator. `username` bleibt für Django-Interna
    erhalten, wird aber intern aus der E-Mail befüllt.
    """

    email = models.EmailField("E-Mail-Adresse", unique=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    objects = UserManager()

    def __str__(self):
        return self.email


class Household(models.Model):
    """Eine Familie / ein Haushalt."""

    name = models.CharField(max_length=120)
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="owned_households",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class FamilyMember(models.Model):
    """Profil einer Person innerhalb eines Haushalts.

    - Eltern: `user` gesetzt (echtes Login), Rolle PARENT.
    - Kinder: `user` leer, `pin_hash` gesetzt (Profilauswahl + PIN), Rolle CHILD.
    """

    class Role(models.TextChoices):
        PARENT = "PARENT", "Elternteil"
        CHILD = "CHILD", "Kind"

    household = models.ForeignKey(
        Household,
        on_delete=models.CASCADE,
        related_name="members",
    )
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="member_profile",
        null=True,
        blank=True,
    )
    display_name = models.CharField(max_length=80)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.CHILD)
    color = models.CharField(
        max_length=7,
        default="#6366f1",
        help_text="Hex-Farbe für Avatar/Akzent, z. B. #6366f1",
    )
    emoji = models.CharField(max_length=8, blank=True, help_text="Avatar-Emoji")
    pin_hash = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["role", "display_name"]

    def __str__(self):
        return f"{self.display_name} ({self.get_role_display()})"

    @property
    def is_parent(self) -> bool:
        return self.role == self.Role.PARENT

    def set_pin(self, raw_pin: str) -> None:
        from django.contrib.auth.hashers import make_password

        self.pin_hash = make_password(raw_pin)

    def check_pin(self, raw_pin: str) -> bool:
        from django.contrib.auth.hashers import check_password

        return bool(self.pin_hash) and check_password(raw_pin, self.pin_hash)
