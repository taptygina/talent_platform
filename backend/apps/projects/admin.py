from django.contrib import admin

from apps.projects.models import (
    Project,
    ProjectComment,
    ProjectLike,
    ProjectStage,
    ProjectStageReview,
    ProjectStageSubmission,
    ProjectStageSubmissionFile,
    ProjectTemplate,
    ProjectTemplateSection,
    StageMaterial,
    Team,
    TeamMember,
)

admin.site.register(Project)
admin.site.register(ProjectStage)
admin.site.register(ProjectComment)
admin.site.register(ProjectLike)
admin.site.register(Team)
admin.site.register(TeamMember)
admin.site.register(ProjectTemplate)
admin.site.register(ProjectTemplateSection)
admin.site.register(StageMaterial)
admin.site.register(ProjectStageSubmission)
admin.site.register(ProjectStageSubmissionFile)
admin.site.register(ProjectStageReview)
