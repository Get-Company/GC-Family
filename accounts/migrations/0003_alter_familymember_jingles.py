from django.db import migrations, models


JINGLE_CHOICES = [
    ("SPARKLE", "Glitzer"), ("BELL", "Glocke"), ("FANFARE", "Fanfare"),
    ("BUBBLE", "Blubber"), ("CELEBRATE", "Jubel"), ("SOFT", "Sanft"),
    ("DOWNBEAT", "Abwärts"), ("RAIN", "Regen"), ("PLOP", "Plopp"),
    ("RESET", "Neustart"),
]


class Migration(migrations.Migration):
    dependencies = [("accounts", "0002_familymember_jingles")]

    operations = [
        migrations.AlterField(model_name="familymember", name="completion_jingle", field=models.CharField(choices=JINGLE_CHOICES, default="SPARKLE", max_length=16)),
        migrations.AlterField(model_name="familymember", name="undo_jingle", field=models.CharField(choices=JINGLE_CHOICES, default="SOFT", max_length=16)),
    ]
