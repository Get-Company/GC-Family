from django.db import migrations, models


def copy_existing_assignees(apps, schema_editor):
    Chore = apps.get_model("chores", "Chore")
    ChoreInstance = apps.get_model("chores", "ChoreInstance")
    for chore in Chore.objects.exclude(default_assignee_id__isnull=True):
        chore.default_assignees.add(chore.default_assignee_id)
    for instance in ChoreInstance.objects.exclude(assigned_member_id__isnull=True):
        instance.assigned_members.add(instance.assigned_member_id)


class Migration(migrations.Migration):
    dependencies = [("chores", "0003_choreinstance_active_until")]

    operations = [
        migrations.AddField(
            model_name="chore",
            name="default_assignees",
            field=models.ManyToManyField(blank=True, help_text="Kinder, die gemeinsam für diese Aufgabe zuständig sind.", related_name="default_chores_multi", to="accounts.familymember"),
        ),
        migrations.AddField(
            model_name="choreinstance",
            name="assigned_members",
            field=models.ManyToManyField(blank=True, help_text="Kinder, denen diese konkrete Aufgabe zugeordnet ist.", related_name="assigned_instances_multi", to="accounts.familymember"),
        ),
        migrations.RunPython(copy_existing_assignees, migrations.RunPython.noop),
    ]
