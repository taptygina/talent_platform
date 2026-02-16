from collections.abc import Iterable

from apps.notifications.models import Notification


def create_notifications(
    recipients: Iterable,
    *,
    actor=None,
    project=None,
    stage=None,
    type: str,
    title: str,
    message: str = "",
) -> None:
    objects = []
    seen = set()
    for recipient in recipients:
        if not recipient:
            continue
        if actor and recipient.id == actor.id:
            continue
        if recipient.id in seen:
            continue
        seen.add(recipient.id)
        objects.append(
            Notification(
                recipient=recipient,
                actor=actor,
                project=project,
                stage=stage,
                type=type,
                title=title,
                message=message,
            )
        )
    if objects:
        Notification.objects.bulk_create(objects)
