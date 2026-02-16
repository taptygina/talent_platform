from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0004_project_academic_group_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="team",
            name="photo_url",
            field=models.URLField(blank=True),
        ),
    ]
