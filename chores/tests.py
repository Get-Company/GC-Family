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
        self.child.set_pin("123456")
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
            {"member_id": self.child.id, "pin": "123456"},
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

    def test_weekly_chore_without_weekday_is_open_for_the_full_family_week(self):
        tokens = self._parent_tokens()
        today = dt.date.today()
        created = self._post(
            "/api/chores",
            {
                "title": "Flexible Wochenaufgabe",
                "points": 10,
                "is_recurring": True,
                "recurrence": {
                    "frequency": "WEEKLY",
                    "interval": 1,
                    "weekdays": [],
                    "start_date": today.isoformat(),
                },
            },
            tokens["access"],
        )
        week_start = today - dt.timedelta(days=(today.weekday() + 1) % 7)

        self.assertEqual(created.status_code, 200)
        instance = ChoreInstance.objects.get(
            chore_id=created.json()["id"], due_date=week_start
        )
        self.assertEqual(instance.due_date, week_start)
        self.assertEqual(instance.active_until, week_start + dt.timedelta(days=6))

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

    def test_child_sees_own_and_unassigned_tasks_but_not_siblings_tasks(self):
        free_chore = Chore.objects.create(
            household=self.household,
            title="Freie Aufgabe",
            created_by=self.parent,
        )
        free_instance = ChoreInstance.objects.create(
            chore=free_chore,
            due_date=dt.date.today(),
        )
        sibling = FamilyMember.objects.create(
            household=self.household,
            display_name="Geschwister",
            role=FamilyMember.Role.CHILD,
        )
        sibling_chore = Chore.objects.create(
            household=self.household,
            title="Nur für Geschwister",
            default_assignee=sibling,
            created_by=self.parent,
        )
        sibling_instance = ChoreInstance.objects.create(
            chore=sibling_chore,
            due_date=dt.date.today(),
            assigned_member=sibling,
        )
        parent_tokens = self._parent_tokens()
        child_token = self._child_token(parent_tokens["access"])
        listed = self.client.get(
            "/api/chores/instances",
            HTTP_AUTHORIZATION=f"Bearer {child_token}",
        )

        self.assertEqual(listed.status_code, 200)
        visible_ids = {item["id"] for item in listed.json()}
        self.assertIn(self.instance.id, visible_ids)
        self.assertIn(free_instance.id, visible_ids)
        self.assertNotIn(sibling_instance.id, visible_ids)

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

    def test_parent_sees_completion_details_and_can_reopen(self):
        parent_tokens = self._parent_tokens()
        child_token = self._child_token(parent_tokens["access"])
        self._post(
            f"/api/chores/instances/{self.instance.id}/complete",
            {"member_id": self.child.id},
            child_token,
        )
        listed = self.client.get(
            "/api/chores/instances",
            HTTP_AUTHORIZATION=f"Bearer {parent_tokens['access']}",
        )
        reopened = self._post(
            f"/api/chores/instances/{self.instance.id}/reopen",
            {},
            parent_tokens["access"],
        )

        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()[0]["completed_by_name"], "Kind")
        self.assertIsNotNone(listed.json()[0]["completed_at"])
        self.assertEqual(reopened.status_code, 200)
        self.assertEqual(reopened.json()["status"], ChoreInstance.Status.OPEN)
        self.assertIsNone(reopened.json()["completed_by_id"])

        forbidden = self._post(
            f"/api/chores/instances/{self.instance.id}/reopen",
            {},
            child_token,
        )
        self.assertEqual(forbidden.status_code, 403)

    def test_parent_cannot_complete_without_a_child_pin_token(self):
        parent_tokens = self._parent_tokens()
        response = self._post(
            f"/api/chores/instances/{self.instance.id}/complete",
            {"member_id": self.child.id},
            parent_tokens["access"],
        )

        self.assertEqual(response.status_code, 403)

    def test_child_cannot_request_previous_weeks(self):
        old_instance = ChoreInstance.objects.create(
            chore=self.chore,
            due_date=dt.date.today() - dt.timedelta(days=8),
            assigned_member=self.child,
        )
        parent_tokens = self._parent_tokens()
        child_token = self._child_token(parent_tokens["access"])
        response = self.client.get(
            f"/api/chores/instances?date_from={old_instance.due_date}&date_to={old_instance.due_date}",
            HTTP_AUTHORIZATION=f"Bearer {child_token}",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_two_children_can_share_a_task_and_receive_team_bonus(self):
        sibling = FamilyMember.objects.create(
            household=self.household,
            display_name="Geschwister",
            role=FamilyMember.Role.CHILD,
        )
        sibling.set_pin("567890")
        sibling.save(update_fields=["pin_hash"])
        first_login = self._post(
            "/api/auth/child-login", {"member_id": self.child.id, "pin": "123456"}
        )
        first_half = self._post(
            f"/api/chores/instances/{self.instance.id}/complete",
            {"member_id": self.child.id, "share": True},
            first_login.json()["access"],
        )
        second_login = self._post(
            "/api/auth/child-login", {"member_id": sibling.id, "pin": "567890"}
        )
        second_half = self._post(
            f"/api/chores/instances/{self.instance.id}/complete",
            {"member_id": sibling.id, "share": True},
            second_login.json()["access"],
        )
        public_dashboard = self.client.get("/api/public/dashboard")
        stats = {item["member_id"]: item for item in public_dashboard.json()["stats"]}

        self.assertEqual(first_half.status_code, 200)
        self.assertEqual(first_half.json()["status"], ChoreInstance.Status.PARTIAL)
        self.assertEqual(second_half.status_code, 200)
        self.assertEqual(second_half.json()["status"], ChoreInstance.Status.DONE)
        self.assertEqual(len(second_half.json()["contributions"]), 2)
        self.assertEqual(stats[self.child.id]["points"], 3.0)
        self.assertEqual(stats[sibling.id]["points"], 3.0)
        self.assertEqual(stats[self.child.id]["completed_tasks"], 0.5)

    def test_manual_task_can_stay_active_over_a_date_range(self):
        tokens = self._parent_tokens()
        start = dt.date.today() - dt.timedelta(days=1)
        end = dt.date.today() + dt.timedelta(days=1)
        created = self._post(
            "/api/chores",
            {
                "title": "Wochenendprojekt",
                "points": 8,
                "is_recurring": False,
                "default_assignee_id": self.child.id,
                "due_date": start.isoformat(),
                "end_date": end.isoformat(),
            },
            tokens["access"],
        )
        dashboard = self.client.get("/api/public/dashboard")
        task = next(item for item in dashboard.json()["instances"] if item["title"] == "Wochenendprojekt")

        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["end_date"], end.isoformat())
        self.assertEqual(task["active_until"], end.isoformat())

    def test_task_can_be_assigned_to_multiple_children(self):
        sibling = FamilyMember.objects.create(
            household=self.household,
            display_name="Geschwister",
            role=FamilyMember.Role.CHILD,
        )
        sibling.set_pin("567890")
        sibling.save(update_fields=["pin_hash"])
        tokens = self._parent_tokens()
        created = self._post(
            "/api/chores",
            {
                "title": "Gemeinsam zuständig",
                "points": 4,
                "is_recurring": False,
                "default_assignee_ids": [self.child.id, sibling.id],
                "due_date": dt.date.today().isoformat(),
            },
            tokens["access"],
        )
        instance = ChoreInstance.objects.get(chore_id=created.json()["id"])
        sibling_login = self._post(
            "/api/auth/child-login", {"member_id": sibling.id, "pin": "567890"}
        )
        completed = self._post(
            f"/api/chores/instances/{instance.id}/complete",
            {"member_id": sibling.id},
            sibling_login.json()["access"],
        )

        self.assertEqual(created.status_code, 200)
        self.assertEqual(set(created.json()["default_assignee_ids"]), {self.child.id, sibling.id})
        self.assertEqual(set(instance.assigned_members.values_list("id", flat=True)), {self.child.id, sibling.id})
        self.assertEqual(completed.status_code, 200)

    def test_member_can_undo_own_completed_task(self):
        parent_tokens = self._parent_tokens()
        child_token = self._child_token(parent_tokens["access"])
        completed = self._post(
            f"/api/chores/instances/{self.instance.id}/complete",
            {"member_id": self.child.id},
            child_token,
        )
        undone = self._post(
            f"/api/chores/instances/{self.instance.id}/uncomplete",
            {},
            child_token,
        )

        self.assertEqual(completed.status_code, 200)
        self.assertEqual(undone.status_code, 200)
        self.assertEqual(undone.json()["status"], ChoreInstance.Status.OPEN)
        self.assertEqual(undone.json()["contributions"], [])

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
