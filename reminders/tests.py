import datetime as dt
import json
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from django.utils import timezone
from ninja_jwt.tokens import AccessToken

from accounts.models import FamilyMember, Household, User
from chores.models import Chore, ChoreContribution, ChoreInstance
from reminders import home_assistant
from reminders.models import Reminder, ReminderDelivery
from reminders.services import message_for, send_due_reminders


class ReminderTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        user = User.objects.create_user(email="parent@reminder.test", username="parent")
        cls.household = Household.objects.create(name="Familie", owner=user)
        cls.parent = FamilyMember.objects.create(household=cls.household, user=user, display_name="Mama", role="PARENT")
        cls.member = FamilyMember.objects.create(household=cls.household, display_name="Kind", notification_service="mobile_app_handy")
        cls.other_household = Household.objects.create(name="Andere Familie", owner=user)
        cls.foreign = FamilyMember.objects.create(household=cls.other_household, display_name="Fremd")
        cls.parent_token = AccessToken.for_user(user)
        cls.parent_token["member_id"] = cls.parent.id
        cls.child_token = AccessToken()
        cls.child_token["member_id"] = cls.member.id

    def request(self, method, path="", payload=None, child=False):
        return getattr(self.client, method)(
            f"/api/reminders{path}", data=json.dumps(payload or {}), content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {self.child_token if child else self.parent_token}",
        )

    def payload(self, **kwargs):
        return {"member_id": self.member.id, "kind": "MESSAGE", "time": "18:00", "weekdays": [0, 2, 4], "message": "Sportsachen einpacken", **kwargs}

    def scheduled(self, **kwargs):
        now = timezone.localtime().replace(hour=18, minute=0, second=0, microsecond=0) + dt.timedelta(days=1)
        reminder = Reminder.objects.create(member=self.member, kind="MESSAGE", message="Test", time=dt.time(18), weekdays=[now.weekday()], **kwargs)
        return reminder, now

    def test_parent_crud_and_validation(self):
        response = self.request("post", payload=self.payload())
        self.assertEqual(response.status_code, 200)
        reminder_id = response.json()["id"]
        updated = self.request("put", f"/{reminder_id}", self.payload(time="19:30", weekdays=[6], enabled=False))
        self.assertEqual(updated.status_code, 200)
        self.assertFalse(updated.json()["enabled"])
        for change in [{"weekdays": []}, {"weekdays": [7]}, {"time": "18:00:30"}, {"kind": "INVALID"}, {"message": " "}, {"message": "x" * 501}]:
            with self.subTest(change=change):
                self.assertEqual(self.request("post", payload=self.payload(**change)).status_code, 422)
        self.assertEqual(self.request("delete", f"/{reminder_id}").status_code, 204)

    def test_children_and_foreign_households_cannot_manage_reminders_or_devices(self):
        self.assertEqual(self.request("post", payload=self.payload(), child=True).status_code, 403)
        self.assertEqual(self.request("post", payload=self.payload(member_id=self.foreign.id)).status_code, 404)
        foreign = Reminder.objects.create(member=self.foreign, time=dt.time(18), weekdays=[0])
        self.assertEqual(self.request("put", f"/{foreign.id}", self.payload()).status_code, 404)
        self.assertEqual(self.request("delete", f"/{foreign.id}").status_code, 404)
        self.assertEqual(self.request("put", f"/members/{self.foreign.id}/device", {"service": ""}).status_code, 404)
        self.assertEqual(self.request("post", f"/members/{self.member.id}/test", child=True).status_code, 403)
        foreign_chore = Chore.objects.create(household=self.other_household, title="Privat")
        self.assertEqual(self.request("post", payload=self.payload(kind="CHORE", chore_id=foreign_chore.id)).status_code, 404)

    @patch("reminders.home_assistant.devices", return_value=[{"service": "mobile_app_handy", "name": "Handy"}])
    def test_device_selection_is_validated_and_can_be_removed(self, devices):
        path = f"/members/{self.member.id}/device"
        self.assertEqual(self.request("put", path, {"service": "mobile_app_handy"}).status_code, 200)
        self.assertEqual(self.request("put", path, {"service": "mobile_app_unknown"}).status_code, 422)
        self.assertEqual(self.request("put", path, {"service": "../turn_on"}).status_code, 422)
        self.assertEqual(self.request("put", path, {"service": ""}).status_code, 200)
        self.member.refresh_from_db()
        self.assertEqual(self.member.notification_service, "")

    @patch("reminders.home_assistant.notify")
    def test_sends_once_per_local_day_even_after_repeated_runs(self, notify):
        reminder, now = self.scheduled()
        self.assertEqual(send_due_reminders(now - dt.timedelta(seconds=1)), 0)
        self.assertEqual(send_due_reminders(now), 1)
        self.assertEqual(send_due_reminders(now + dt.timedelta(minutes=1)), 0)
        notify.assert_called_once_with("mobile_app_handy", "Test", f"gc-family-{reminder.id}-{now.date()}")
        reminder.refresh_from_db()
        self.assertEqual(reminder.last_sent_at, now)

    @patch("reminders.home_assistant.notify")
    def test_schedule_uses_berlin_day_and_survives_repeated_dst_hour(self, notify):
        reminder, _ = self.scheduled()
        reminder.time, reminder.weekdays = dt.time(2, 30), [6]
        reminder.save()
        # Am 25.10.2026 gibt es 02:30 in Berlin zweimal. Ein Tagesversand genügt.
        first = dt.datetime(2026, 10, 25, 0, 30, tzinfo=dt.timezone.utc)
        second = dt.datetime(2026, 10, 25, 1, 30, tzinfo=dt.timezone.utc)
        Reminder.objects.filter(id=reminder.id).update(created_at=first - dt.timedelta(days=1))
        self.assertEqual(send_due_reminders(first), 1)
        self.assertEqual(send_due_reminders(second), 0)
        notify.assert_called_once()

    @patch("reminders.home_assistant.notify")
    def test_disabled_wrong_weekday_and_missed_window_are_not_sent(self, notify):
        reminder, now = self.scheduled(enabled=False)
        self.assertEqual(send_due_reminders(now), 0)
        reminder.enabled = True
        reminder.weekdays = [(now.weekday() + 1) % 7]
        reminder.save()
        self.assertEqual(send_due_reminders(now), 0)
        reminder.weekdays = [now.weekday()]
        reminder.save()
        self.assertEqual(send_due_reminders(now + dt.timedelta(minutes=16)), 0)
        notify.assert_not_called()

    @patch("reminders.home_assistant.notify", side_effect=home_assistant.HomeAssistantError("Nicht erreichbar"))
    def test_failed_delivery_retries_at_most_three_times_and_keeps_error(self, notify):
        reminder, now = self.scheduled()
        for seconds in [0, 30, 60, 120, 180]:
            send_due_reminders(now + dt.timedelta(seconds=seconds))
        self.assertEqual(notify.call_count, 3)
        reminder.refresh_from_db()
        self.assertEqual(reminder.last_error, "Nicht erreichbar")
        self.assertIsNone(reminder.last_sent_at)
        self.assertEqual(ReminderDelivery.objects.get(reminder=reminder).attempts, 3)

    @patch("reminders.home_assistant.notify")
    def test_open_tasks_ignore_completed_foreign_assignees_and_own_contributions(self, notify):
        reminder, now = self.scheduled()
        reminder.kind = "OPEN_TASKS"
        reminder.save()
        chore = Chore.objects.create(household=self.household, title="Aufräumen", default_assignee=self.member)
        instance = ChoreInstance.objects.create(chore=chore, due_date=now.date(), assigned_member=self.member)
        self.assertIn("Aufräumen", message_for(reminder, now.date()))
        instance.status = "DONE"
        instance.save()
        self.assertIsNone(message_for(reminder, now.date()))
        instance.status = "PARTIAL"
        instance.save()
        contribution = ChoreContribution.objects.create(instance=instance, member=self.member, share="0.50")
        self.assertIsNone(message_for(reminder, now.date()))
        contribution.delete()
        instance.status = "OPEN"
        instance.assigned_member = self.parent
        instance.save()
        self.assertIsNone(message_for(reminder, now.date()))
        self.assertEqual(send_due_reminders(now), 0)
        self.assertEqual(ReminderDelivery.objects.get(reminder=reminder).status, "SKIPPED")
        notify.assert_not_called()

    def test_specific_task_reminder_only_mentions_chosen_task(self):
        reminder, now = self.scheduled()
        first = Chore.objects.create(household=self.household, title="Pflanzen")
        second = Chore.objects.create(household=self.household, title="Müll")
        for chore in [first, second]:
            ChoreInstance.objects.create(chore=chore, due_date=now.date())
        reminder.kind, reminder.chore = "CHORE", first
        self.assertIn("Pflanzen", message_for(reminder, now.date()))
        self.assertNotIn("Müll", message_for(reminder, now.date()))

    @override_settings(HOME_ASSISTANT_URL="", HOME_ASSISTANT_TOKEN="")
    def test_unconfigured_integration_returns_useful_status(self):
        response = self.client.get("/api/reminders/devices", HTTP_AUTHORIZATION=f"Bearer {self.parent_token}")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["configured"])

    @patch("reminders.home_assistant.request")
    def test_device_discovery_excludes_other_services(self, request):
        request.return_value = [{"domain": "light", "services": {"turn_on": {}}}, {"domain": "notify", "services": {"mobile_app_handy": {"name": "Mein Handy"}, "persistent_notification": {}, "send_message": {}}}]
        self.assertEqual(home_assistant.devices(), [{"service": "mobile_app_handy", "name": "Mein Handy"}])

    @override_settings(HOME_ASSISTANT_URL="https://ha.example.test", HOME_ASSISTANT_TOKEN="secret-test-token", GC_FAMILY_PUBLIC_URL="https://family.example.test")
    @patch("reminders.home_assistant.build_opener")
    def test_notification_uses_authenticated_service_post(self, opener):
        response = MagicMock()
        response.read.return_value = b"[]"
        opener.return_value.open.return_value.__enter__.return_value = response
        home_assistant.notify("mobile_app_handy", "Hallo", "test-tag")
        request = opener.return_value.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://ha.example.test/api/services/notify/mobile_app_handy")
        self.assertEqual(request.get_header("Authorization"), "Bearer secret-test-token")
        self.assertEqual(json.loads(request.data), {"title": "GC-Family", "message": "Hallo", "data": {"tag": "test-tag", "url": "https://family.example.test", "clickAction": "https://family.example.test"}})
