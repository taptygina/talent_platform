from celery import shared_task

from apps.notifications.models import NotificationType
from apps.notifications.services import create_notifications
from apps.projects.models import Project, ProjectStage
from apps.users.models import User


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 5},
)
def dispatch_comment_notifications_task(
    self,
    *,
    recipient_ids: list[int],
    actor_id: int,
    project_id: int,
    stage_id: int | None,
    message: str,
) -> None:
    recipients = User.objects.filter(id__in=recipient_ids)
    actor = User.objects.filter(id=actor_id).first()
    project = Project.objects.filter(id=project_id).first()
    stage = ProjectStage.objects.filter(id=stage_id).first() if stage_id else None
    if not actor or not project:
        return
    create_notifications(
        recipients,
        actor=actor,
        project=project,
        stage=stage,
        type=NotificationType.COMMENT_PENDING,
        title="Комментарий опубликован",
        message=message,
    )

