# Generated manually for the shared-task feature.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
        ("chores", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="choreinstance",
            name="status",
            field=models.CharField(
                choices=[
                    ("OPEN", "Offen"),
                    ("PARTIAL", "Wird gemeinsam erledigt"),
                    ("DONE", "Erledigt"),
                    ("SKIPPED", "Übersprungen"),
                ],
                default="OPEN",
                max_length=10,
            ),
        ),
        migrations.CreateModel(
            name="ChoreContribution",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("share", models.DecimalField(decimal_places=2, max_digits=3)),
                ("completed_at", models.DateTimeField(auto_now_add=True)),
                ("instance", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="contributions", to="chores.choreinstance")),
                ("member", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="chore_contributions", to="accounts.familymember")),
            ],
            options={"ordering": ["completed_at"]},
        ),
        migrations.AddConstraint(
            model_name="chorecontribution",
            constraint=models.UniqueConstraint(fields=("instance", "member"), name="unique_chore_contribution_per_member"),
        ),
    ]
