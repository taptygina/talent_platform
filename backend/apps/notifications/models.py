from django.conf import settings
from django.db import models


class NotificationType(models.TextChoices):
    PROJECT_ASSIGNED = "project_assigned", "?????? ????????"
    TEAM_INVITED = "team_invited", "??????????? ? ???????"
    SUPERVISOR_INVITED = "supervisor_invited", "??????????? ????????????"
    SUPERVISOR_INVITE_ACCEPTED = "supervisor_invite_accepted", "??????????? ???????????? ???????"
    SUPERVISOR_INVITE_DECLINED = "supervisor_invite_declined", "??????????? ???????????? ?????????"
    STAGE_CREATED = "stage_created", "???? ??????"
    STAGE_SUBMITTED = "stage_submitted", "???? ?????????"
    STAGE_REVIEWED = "stage_reviewed", "Этап проверен"
    COMMENT_PENDING = "comment_pending", "??????????? ??????? ?????????"
    PROJECT_PUBLISH_REQUEST = "project_publish_request", "?????? ?? ?????????? ???????"


class Notification(models.Model):
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="actor_notifications",
    )
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="notifications",
    )
    stage = models.ForeignKey(
        "projects.ProjectStage",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="notifications",
    )
    type = models.CharField(max_length=40, choices=NotificationType.choices)
    title = models.CharField(max_length=255)
    message = models.TextField(blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.recipient_id}:{self.type}:{self.title}"
