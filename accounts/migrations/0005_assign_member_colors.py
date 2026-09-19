from django.db import migrations


PALETTE = (
    "#2563eb",
    "#059669",
    "#d97706",
    "#7c3aed",
    "#dc2626",
    "#0891b2",
    "#be123c",
    "#4f46e5",
)
LEGACY_DEFAULT = "#6366f1"


def assign_profile_colors(apps, schema_editor):
    """Verteilt unterschiedliche Farben auf bisher gleichfarbige Profile."""
    Household = apps.get_model("accounts", "Household")
    FamilyMember = apps.get_model("accounts", "FamilyMember")

    for household in Household.objects.all().iterator():
        used = set()
        members = FamilyMember.objects.filter(household_id=household.id).order_by(
            "created_at", "id"
        )
        for member in members:
            color = member.color.lower()
            if color != LEGACY_DEFAULT and color not in used:
                used.add(color)
                continue

            color = next(
                (candidate for candidate in PALETTE if candidate not in used),
                PALETTE[len(used) % len(PALETTE)],
            )
            member.color = color
            member.save(update_fields=["color"])
            used.add(color)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0004_familymember_notification_service")]

    operations = [migrations.RunPython(assign_profile_colors, migrations.RunPython.noop)]
