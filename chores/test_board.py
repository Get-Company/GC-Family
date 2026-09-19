import datetime as dt
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from ninja_jwt.tokens import AccessToken

from accounts.models import FamilyMember, Household, User
from chores.api import _weekly_stats
from chores.board import task_board
from chores.models import Chore, ChoreContribution, ChoreInstance, RecurrenceRule
from chores.services import next_occurrence


class BoardTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        user = User.objects.create_user(email="board@test.example", username="board")
        cls.household = Household.objects.create(name="Familie", owner=user)
        cls.member = FamilyMember.objects.create(household=cls.household, display_name="Anna")

    def recurring(self, frequency="DAILY", **kwargs):
        chore = Chore.objects.create(household=self.household, title="Wiederkehrend", is_recurring=True, default_assignee=self.member)
        RecurrenceRule.objects.create(chore=chore, frequency=frequency, start_date=dt.date(2026, 9, 1), **kwargs)
        return chore

    def test_all_definitions_are_visible_once_including_completed_and_future(self):
        today = dt.date(2026, 9, 19)
        daily = self.recurring()
        completed = Chore.objects.create(household=self.household, title="Einmal erledigt")
        last = ChoreInstance.objects.create(chore=completed, due_date=today - dt.timedelta(days=1), status="DONE", completed_by=self.member, completed_at=timezone.now())
        future = Chore.objects.create(household=self.household, title="Morgen")
        ChoreInstance.objects.create(chore=future, due_date=today + dt.timedelta(days=1))
        board = task_board(self.household, today)
        self.assertEqual(len(board), 3)
        self.assertEqual(board[0]["id"], daily.id)
        self.assertTrue(board[0]["available"])
        self.assertEqual(board[0]["assigned_member_ids"], [self.member.id])
        self.assertEqual(board[0]["assigned_members"][0].id, self.member.id)
        self.assertEqual(board[0]["assigned_members"][0].color, self.member.color)
        dashboard = self.client.get("/api/public/dashboard")
        dashboard_task = next(item for item in dashboard.json()["tasks"] if item["id"] == daily.id)
        self.assertEqual(dashboard.status_code, 200)
        self.assertEqual(dashboard_task["assigned_members"][0]["id"], self.member.id)
        self.assertEqual(dashboard_task["assigned_members"][0]["color"], self.member.color)
        inactive = {item["id"]: item for item in board[1:]}
        self.assertEqual(inactive[completed.id]["last_completion"].id, last.id)
        self.assertIsNone(inactive[completed.id]["next_available_on"])
        self.assertEqual(inactive[future.id]["next_available_on"], today + dt.timedelta(days=1))

    def test_completed_daily_task_stays_visible_until_new_day(self):
        today = dt.date(2026, 9, 19)
        self.recurring()
        instance = task_board(self.household, today)[0]["instance"]
        instance.status, instance.completed_by, instance.completed_at = "DONE", self.member, timezone.now()
        instance.save()
        same_day = task_board(self.household, today)[0]
        self.assertFalse(same_day["available"])
        self.assertEqual(same_day["next_available_on"], today + dt.timedelta(days=1))
        tomorrow = task_board(self.household, today + dt.timedelta(days=1))[0]
        self.assertTrue(tomorrow["available"])
        self.assertEqual(tomorrow["last_completion"].id, instance.id)
        self.assertNotEqual(tomorrow["instance"].id, instance.id)

    def test_next_occurrence_handles_intervals_month_end_and_ended_rules(self):
        rule = RecurrenceRule(frequency="MONTHLY", start_date=dt.date(2026, 1, 31), day_of_month=31, interval=1)
        self.assertEqual(next_occurrence(rule, dt.date(2026, 1, 31)), dt.date(2026, 3, 31))
        rule.end_date = dt.date(2026, 3, 1)
        self.assertIsNone(next_occurrence(rule, dt.date(2026, 1, 31)))
        rule = RecurrenceRule(frequency="WEEKLY", start_date=dt.date(2026, 9, 6), interval=2, weekdays=[])
        self.assertEqual(next_occurrence(rule, dt.date(2026, 9, 12)), dt.date(2026, 9, 20))
        rule.weekdays = [0, 4]
        self.assertEqual(next_occurrence(rule, dt.date(2026, 9, 11)), dt.date(2026, 9, 21))

    def test_flexible_week_is_not_available_before_its_rule_start(self):
        chore = self.recurring("WEEKLY", weekdays=[])
        rule = chore.recurrence
        rule.start_date = dt.date(2026, 9, 23)
        rule.save()
        task = task_board(self.household, dt.date(2026, 9, 21))[0]
        self.assertFalse(task["available"])
        self.assertEqual(task["next_available_on"], dt.date(2026, 9, 23))

    def test_future_weekly_and_expired_daily_cannot_be_completed(self):
        today = timezone.localdate()
        chore = self.recurring("WEEKLY", weekdays=[today.weekday()])
        token = AccessToken()
        token["member_id"] = self.member.id
        for day in [today - dt.timedelta(days=1), today + dt.timedelta(days=7)]:
            instance = ChoreInstance.objects.create(chore=chore, due_date=day)
            response = self.client.post(f"/api/chores/instances/{instance.id}/complete", data="{}", content_type="application/json", HTTP_AUTHORIZATION=f"Bearer {token}")
            self.assertEqual(response.status_code, 409)

    def test_score_periods_use_completion_date_and_count_legacy_only_once(self):
        today = dt.date(2026, 9, 19)
        chore = Chore.objects.create(household=self.household, title="Punkte", points=10)
        for due, completed, share in [(dt.date(2026, 8, 31), dt.date(2026, 9, 13), "0.50"), (dt.date(2026, 9, 1), dt.date(2026, 9, 2), "1.00")]:
            instance = ChoreInstance.objects.create(chore=chore, due_date=due, status="DONE", completed_by=self.member)
            contribution = ChoreContribution.objects.create(instance=instance, member=self.member, share=Decimal(share))
            ChoreContribution.objects.filter(id=contribution.id).update(completed_at=timezone.make_aware(dt.datetime.combine(completed, dt.time(12))))
        ChoreInstance.objects.create(chore=chore, due_date=dt.date(2026, 8, 1), status="DONE", completed_by=self.member)
        self.assertEqual(_weekly_stats(self.household, dt.date(2026, 9, 13), today)[0]["points"], 6)
        self.assertEqual(_weekly_stats(self.household, dt.date(2026, 9, 1), today)[0]["points"], 16)
        self.assertEqual(_weekly_stats(self.household, None, today)[0]["points"], 26)

    def test_authenticated_board_uses_members_household(self):
        foreign = Household.objects.create(name="Andere Familie", owner=self.household.owner)
        member = FamilyMember.objects.create(household=foreign, display_name="Fremd")
        Chore.objects.create(household=self.household, title="Privat")
        token = AccessToken()
        token["member_id"] = member.id
        response = self.client.get("/api/chores/dashboard", HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["tasks"], [])
        self.assertEqual([item["id"] for item in response.json()["members"]], [member.id])
