import json

from django.test import TestCase

from accounts.models import FamilyMember, Household, User


class AuthApiTests(TestCase):
    """Die Login- und PIN-Flows halten Familien strikt getrennt."""

    def setUp(self):
        self.parent = User.objects.create_user(
            email="mama@example.test",
            username="mama@example.test",
            password="sicheres-passwort",
        )
        self.household = Household.objects.create(name="Familie Test", owner=self.parent)
        self.parent_member = FamilyMember.objects.create(
            household=self.household,
            user=self.parent,
            display_name="Mama",
            role=FamilyMember.Role.PARENT,
        )
        self.child = FamilyMember.objects.create(
            household=self.household,
            display_name="Kind",
            role=FamilyMember.Role.CHILD,
        )
        self.child.set_pin("1234")
        self.child.save(update_fields=["pin_hash"])

    def _post(self, path: str, payload: dict[str, object], token: str | None = None):
        headers = {"content_type": "application/json"}
        if token:
            headers["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        return self.client.post(path, data=json.dumps(payload), **headers)

    def _login(self) -> dict[str, str]:
        response = self._post(
            "/api/auth/login",
            {"email": self.parent.email, "password": "sicheres-passwort"},
        )
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_parent_login_me_and_refresh(self):
        tokens = self._login()
        me = self.client.get(
            "/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {tokens['access']}"
        )
        refreshed = self._post("/api/auth/refresh", {"refresh": tokens["refresh"]})

        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["household"]["id"], self.household.id)
        self.assertEqual(me.json()["member"]["id"], self.parent_member.id)
        self.assertEqual(refreshed.status_code, 200)
        self.assertIn("access", refreshed.json())

    def test_invalid_credentials_and_pin_are_rejected(self):
        invalid_login = self._post(
            "/api/auth/login",
            {"email": self.parent.email, "password": "falsch"},
        )
        tokens = self._login()
        invalid_pin = self._post(
            "/api/auth/pin",
            {"member_id": self.child.id, "pin": "0000"},
            tokens["access"],
        )

        self.assertEqual(invalid_login.status_code, 401)
        self.assertEqual(invalid_pin.status_code, 401)

    def test_pin_requires_parent_device_context_and_returns_child_token(self):
        tokens = self._login()
        response = self._post(
            "/api/auth/pin",
            {"member_id": self.child.id, "pin": "1234"},
            tokens["access"],
        )
        me = self.client.get(
            "/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["member"]["id"], self.child.id)
