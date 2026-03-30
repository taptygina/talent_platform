from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0002_user_avatar_url"),
    ]

    operations = [
        migrations.CreateModel(
            name="SystemSetting",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("platform_name", models.CharField(default="Инженерия проектов", max_length=120)),
                ("max_team_members", models.PositiveSmallIntegerField(default=20)),
                ("upcoming_deadline_days", models.PositiveSmallIntegerField(default=7)),
                ("allow_public_feed", models.BooleanField(default=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Настройка системы",
                "verbose_name_plural": "Настройки системы",
            },
        ),
    ]
