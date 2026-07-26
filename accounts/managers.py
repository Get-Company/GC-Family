from django.contrib.auth.models import UserManager as DjangoUserManager


class UserManager(DjangoUserManager):
    """User-Manager mit E-Mail als primärem Identifikator.

    Fällt für `username` auf die E-Mail zurück, falls keiner angegeben ist,
    damit `createsuperuser` und programmatische Erstellung ohne separaten
    Benutzernamen funktionieren.
    """

    def _create_user(self, username=None, email=None, password=None, **extra_fields):
        if not email:
            raise ValueError("Eine E-Mail-Adresse ist erforderlich.")
        email = self.normalize_email(email)
        username = username or email
        user = self.model(username=username, email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, username=None, email=None, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(username, email, password, **extra_fields)

    def create_superuser(self, username=None, email=None, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser muss is_staff=True haben.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser muss is_superuser=True haben.")
        return self._create_user(username, email, password, **extra_fields)
