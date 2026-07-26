import datetime as dt
import json

from django.test import TestCase

from accounts.models import FamilyMember, Household, User
from chores.models import Chore, ChoreInstance


class ChoreAuthorizationTests(TestCase):
    """Aufgaben bleiben im Haushalt und Kinder im eigenen Profilbereich."""

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
        self.chore = Chore.objects.create(
            household=self.household,
            title="Zimmer aufräumen",
            points=5,
            default_assignee=self.child,
            created_by=self.parent,
        )
        self.instance = ChoreInstance.objects.create(
            chore=self.chore,
            due_date=dt.date.today(),
            assigned_member=self.child,
        )
        other_parent = User.objects.create_user(
            email="andere@example.test",
            username="andere@example.test",
            password="sicheres-passwort",
        )
        other_household = Household.objects.create(name="Andere Familie", owner=other_parent)
        other_member = FamilyMember.objects.create(
            household=other_household,
            user=other_parent,
            display_name="Andere Mama",
            role=FamilyMember.Role.PARENT,
        )
        other_chore = Chore.objects.create(
            household=other_household,
            title="Private Aufgabe",
            created_by=other_parent,
        )
        self.other_instance = ChoreInstance.objects.create(
            chore=other_chore,
            due_date=dt.date.today(),
            assigned_member=other_member,
        )

    def _post(self, path: str, payload: dict[str, object], token: str | None = None):
        headers = {"content_type": "application/json"}
        if token:
            headers["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        return self.client.post(path, data=json.dumps(payload), **headers)

    def _parent_tokens(self) -> dict[str, str]:
        response = self._post(
            "/api/auth/login",
            {"email": self.parent.email, "password": "sicheres-passwort"},
        )
        self.assertEqual(response.status_code, 200)
        return response.json()

    def _child_token(self, parent_token: str) -> str:
        response = self._post(
            "/api/auth/pin",
            {"member_id": self.child.id, "pin": "1234"},
            parent_token,
        )
        self.assertEqual(response.status_code, 200)
        return response.json()["access"]

    def test_chores_require_auth_and_do_not_leak_households(self):
        unauthenticated = self.client.get("/api/chores/instances")
        tokens = self._parent_tokens()
        instances = self.client.get(
            "/api/chores/instances",
            HTTP_AUTHORIZATION=f"Bearer {tokens['access']}",
        )
        foreign = self._post(
            f"/api/chores/instances/{self.other_instance.id}/complete",
            {},
            tokens["access"],
        )

        self.assertEqual(unauthenticated.status_code, 401)
        self.assertEqual(instances.status_code, 200)
        self.assertEqual([item["id"] for item in instances.json()], [self.instance.id])
        self.assertEqual(foreign.status_code, 404)

    def test_child_can_complete_own_task_but_cannot_skip_or_view_others(self):
        parent_tokens = self._parent_tokens()
        child_token = self._child_token(parent_tokens["access"])
        complete = self._post(
            f"/api/chores/instances/{self.instance.id}/complete",
            {"member_id": self.child.id},
            child_token,
        )
        skip = self._post(
            f"/api/chores/instances/{self.instance.id}/skip",
            {},
            child_token,
        )
        other_member = FamilyMember.objects.create(
            household=self.household,
            display_name="Geschwister",
            role=FamilyMember.Role.CHILD,
        )
        filtered = self.client.get(
            f"/api/chores/instances?member_id={other_member.id}",
            HTTP_AUTHORIZATION=f"Bearer {child_token}",
        )

        self.assertEqual(complete.status_code, 200)
        self.assertEqual(complete.json()["status"], ChoreInstance.Status.DONE)
        self.assertEqual(skip.status_code, 403)
        self.assertEqual(filtered.status_code, 403)

    def test_stats_report_completed_points_and_streak_for_current_member(self):
        parent_tokens = self._parent_tokens()
        child_token = self._child_token(parent_tokens["access"])
        self._post(
            f"/api/chores/instances/{self.instance.id}/complete",
            {"member_id": self.child.id},
            child_token,
        )
        stats = self.client.get(
            "/api/chores/stats",
            HTTP_AUTHORIZATION=f"Bearer {child_token}",
        )

        self.assertEqual(stats.status_code, 200)
        self.assertEqual(stats.json(), {"points_today": 5, "current_streak": 1})

    def test_parent_can_create_update_and_delete_recurring_chore(self):
        tokens = self._parent_tokens()
        payload = {
            "title": "Pflanzen gießen",
            "description": "Im Wohnzimmer",
            "icon": "🪴",
            "color": "#059669",
            "points": 3,
            "is_recurring": True,
            "default_assignee_id": self.child.id,
            "recurrence": {
                "frequency": "DAILY",
                "interval": 1,
                "weekdays": [],
                "start_date": dt.date.today().isoformat(),
            },
        }
        created = self._post("/api/chores", payload, tokens["access"])
        chore_id = created.json()["id"]
        payload["points"] = 7
        updated = self.client.put(
            f"/api/chores/{chore_id}",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {tokens['access']}",
        )

        self.assertEqual(created.status_code, 200)
        self.assertTrue(ChoreInstance.objects.filter(chore_id=chore_id).exists())
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["points"], 7)
        deleted = self.client.delete(
            f"/api/chores/{chore_id}",
            HTTP_AUTHORIZATION=f"Bearer {tokens['access']}",
        )
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(Chore.objects.filter(id=chore_id).exists())
