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

router = DefaultRouter()
router.register(r"stages", ProjectStageViewSet, basename="stage")
router.register(r"comments", ProjectCommentViewSet, basename="comment")
router.register(r"likes", ProjectLikeViewSet, basename="like")
router.register(r"teams-manage", TeamManageViewSet, basename="team-manage")
router.register(r"supervisor-invites", ProjectSupervisorInviteViewSet, basename="supervisor-invite")
router.register(r"", ProjectViewSet, basename="project")

urlpatterns = [
    path("", include(router.urls)),
]
