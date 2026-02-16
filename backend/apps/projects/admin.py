from django.contrib import admin

from apps.projects.models import Project, ProjectComment, ProjectLike, ProjectStage, Team, TeamMember

admin.site.register(Project)
admin.site.register(ProjectStage)
admin.site.register(ProjectComment)
admin.site.register(ProjectLike)
admin.site.register(Team)
admin.site.register(TeamMember)
