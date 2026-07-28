from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("chores", "0002_chorecontribution_partial_status")]

    operations = [
        migrations.AddField(
            model_name="choreinstance",
            name="active_until",
            field=models.DateField(blank=True, help_text="Optionales Ende eines Zeitraums für einmalige Aufgaben.", null=True),
        )
    ]
