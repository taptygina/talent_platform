from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0005_team_photo_url"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProjectSupervisorInvite",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("message", models.TextField(blank=True)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("accepted", "Accepted"), ("declined", "Declined")], default="pending", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("responded_at", models.DateTimeField(blank=True, null=True)),
                ("project", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="supervisor_invites", to="projects.project")),
                ("student", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sent_supervisor_invites", to="users.user")),
                ("teacher", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="received_supervisor_invites", to="users.user")),
            ],
            options={
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddConstraint(
            model_name="projectsupervisorinvite",
            constraint=models.UniqueConstraint(condition=models.Q(("status", "pending")), fields=("project", "student", "teacher", "status"), name="unique_pending_supervisor_invite"),
        ),
    ]
