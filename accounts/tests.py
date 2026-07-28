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
        self.parent_member.set_pin("111111")
        self.parent_member.save(update_fields=["pin_hash"])
        self.child = FamilyMember.objects.create(
            household=self.household,
            display_name="Kind",
            role=FamilyMember.Role.CHILD,
        )
        self.child.set_pin("123456")
        self.child.save(update_fields=["pin_hash"])

    def _post(self, path: str, payload: dict[str, object], token: str | None = None):
        headers = {"content_type": "application/json"}
        if token:
            headers["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        return self.client.post(path, data=json.dumps(payload), **headers)

    def _login(self) -> dict[str, str]:
        response = self._post(
            "/api/auth/pin-login",
            {"pin": "111111"},
        )
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_unified_parent_pin_login_loads_parent_profile(self):
        tokens = self._login()
        me = self.client.get(
            "/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {tokens['access']}"
        )

        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["household"]["id"], self.household.id)
        self.assertEqual(me.json()["member"]["id"], self.parent_member.id)
        self.assertEqual(me.json()["member"]["role"], FamilyMember.Role.PARENT)

    def test_invalid_credentials_and_pin_are_rejected(self):
        invalid_login = self._post("/api/auth/pin-login", {"pin": "000000"})
        tokens = self._login()
        invalid_pin = self._post(
            "/api/auth/pin",
            {"member_id": self.child.id, "pin": "000000"},
            tokens["access"],
        )

        self.assertEqual(invalid_login.status_code, 401)
        self.assertEqual(invalid_pin.status_code, 401)

    def test_pin_requires_parent_device_context_and_returns_child_token(self):
        tokens = self._login()
        response = self._post(
            "/api/auth/pin",
            {"member_id": self.child.id, "pin": "123456"},
            tokens["access"],
        )
        me = self.client.get(
            "/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["member"]["id"], self.child.id)

    def test_child_can_log_in_directly_with_profile_and_pin(self):
        response = self._post(
            "/api/auth/pin-login",
            {"pin": "123456"},
        )
        me = self.client.get(
            "/api/auth/me", HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["member"]["id"], self.child.id)

    def test_parent_can_manage_members_and_child_pins(self):
        tokens = self._login()
        created_parent = self._post(
            "/api/auth/household/manage-members/parents",
            {
                "display_name": "Papa",
                "email": "papa@example.test",
                "pin": "222222",
            },
            tokens["access"],
        )
        created_child = self._post(
            "/api/auth/household/manage-members/children",
            {"display_name": "Geschwister", "pin": "567890"},
            tokens["access"],
        )
        updated_child = self.client.put(
            f"/api/auth/household/manage-members/children/{created_child.json()['id']}",
            data=json.dumps({"display_name": "Geschwister", "pin": "999999"}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {tokens['access']}",
        )
        members = self.client.get(
            "/api/auth/household/manage-members",
            HTTP_AUTHORIZATION=f"Bearer {tokens['access']}",
        )

        self.assertEqual(created_parent.status_code, 200)
        self.assertEqual(created_parent.json()["email"], "papa@example.test")
        self.assertEqual(created_child.status_code, 200)
        self.assertEqual(updated_child.status_code, 200)
        self.assertTrue(
            FamilyMember.objects.get(id=created_child.json()["id"]).check_pin("999999")
        )
        self.assertEqual(members.status_code, 200)
        self.assertEqual(len(members.json()), 4)
