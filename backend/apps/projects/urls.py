from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.projects.views import (
    ProjectCommentViewSet,
    ProjectLikeViewSet,
    ProjectSupervisorInviteViewSet,
    ProjectStageViewSet,
    ProjectViewSet,
    TeamManageViewSet,
)
from apps.projects.views_workflow import (
    ProjectStageReviewViewSet,
    ProjectStageSubmissionFileViewSet,
    ProjectStageSubmissionViewSet,
    ProjectTemplateSectionViewSet,
    ProjectTemplateViewSet,
    StageMaterialViewSet,
)
from apps.projects.views_exports import ProjectExportMatrixXlsxView, ProjectExportNirsDocxView

router = DefaultRouter()
router.register(r"templates", ProjectTemplateViewSet, basename="project-template")
router.register(r"template-sections", ProjectTemplateSectionViewSet, basename="project-template-section")
router.register(r"stages", ProjectStageViewSet, basename="stage")
router.register(r"stage-materials", StageMaterialViewSet, basename="stage-material")
router.register(r"stage-submissions", ProjectStageSubmissionViewSet, basename="stage-submission")
router.register(r"stage-submission-files", ProjectStageSubmissionFileViewSet, basename="stage-submission-file")
router.register(r"stage-reviews", ProjectStageReviewViewSet, basename="stage-review")
router.register(r"comments", ProjectCommentViewSet, basename="comment")
router.register(r"likes", ProjectLikeViewSet, basename="like")
router.register(r"teams-manage", TeamManageViewSet, basename="team-manage")
router.register(r"supervisor-invites", ProjectSupervisorInviteViewSet, basename="supervisor-invite")
router.register(r"", ProjectViewSet, basename="project")

urlpatterns = [
    path("<int:pk>/export-nirs-docx/", ProjectExportNirsDocxView.as_view(), name="project-export-nirs-docx"),
    path("<int:pk>/export-matrix-xlsx/", ProjectExportMatrixXlsxView.as_view(), name="project-export-matrix-xlsx"),
    path("", include(router.urls)),
]
