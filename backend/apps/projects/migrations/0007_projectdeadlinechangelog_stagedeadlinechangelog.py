from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0006_projectsupervisorinvite"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ProjectDeadlineChangeLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("old_start_date", models.DateField(blank=True, null=True)),
                ("new_start_date", models.DateField(blank=True, null=True)),
                ("old_end_date", models.DateField(blank=True, null=True)),
                ("new_end_date", models.DateField(blank=True, null=True)),
                ("reason", models.TextField()),
                ("changed_at", models.DateTimeField(auto_now_add=True)),
                (
                    "changed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="project_deadline_changes",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="deadline_changes",
                        to="projects.project",
                    ),
                ),
            ],
            options={
                "ordering": ("-changed_at",),
            },
        ),
        migrations.CreateModel(
            name="StageDeadlineChangeLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("old_deadline", models.DateField(blank=True, null=True)),
                ("new_deadline", models.DateField(blank=True, null=True)),
                ("reason", models.TextField()),
                ("changed_at", models.DateTimeField(auto_now_add=True)),
                (
                    "changed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="stage_deadline_changes",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "stage",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="deadline_changes",
                        to="projects.projectstage",
                    ),
                ),
            ],
            options={
                "ordering": ("-changed_at",),
            },
        ),
    ]
