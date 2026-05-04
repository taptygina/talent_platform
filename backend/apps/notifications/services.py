from collections.abc import Iterable
import logging

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from apps.notifications.models import Notification, NotificationType

logger = logging.getLogger(__name__)

ROLE_LABELS = {
    "student": "Студент",
    "teacher": "Преподаватель",
    "methodist": "Методист",
    "curator": "Куратор",
    "admin": "Администратор",
}


def _full_name(user) -> str:
    if not user:
        return ""
    value = (getattr(user, "full_name", "") or "").strip()
    if value:
        return value
    parts = [
        (getattr(user, "last_name", "") or "").strip(),
        (getattr(user, "first_name", "") or "").strip(),
        (getattr(user, "middle_name", "") or "").strip(),
    ]
    fallback = " ".join([part for part in parts if part]).strip()
    return fallback or (getattr(user, "username", "") or "").strip()


def _actor_label(actor) -> str:
    if not actor:
        return "Неизвестно"
    full_name = _full_name(actor) or "Неизвестно"
    role_value = (getattr(actor, "role", "") or "").strip()
    role_label = ROLE_LABELS.get(role_value, role_value or "Неизвестно")
    return f"{full_name}, {role_label}"


def _build_email_body(notification: Notification) -> str:
    base_message = (notification.message or "").strip() or (notification.title or "").strip()

    if notification.type != NotificationType.PROJECT_ASSIGNED:
        return base_message

    timestamp = timezone.localtime(notification.created_at or timezone.now()).strftime("%d.%m.%Y %H:%M:%S")
    actor_info = _actor_label(notification.actor)
    lines = [
        notification.title or "Уведомление",
        "",
        base_message,
        "",
        f"Кто добавил: {actor_info}",
        f"Когда: {timestamp}",
    ]
    return "\n".join(lines).strip()


def _send_notification_email(notification: Notification) -> None:
    recipient = notification.recipient
    if not settings.EMAIL_NOTIFICATIONS_ENABLED:
        return
    recipient_email = (getattr(recipient, "email", "") or "").strip()
    if not recipient_email:
        return
    recipient_domain = recipient_email.rsplit("@", 1)[-1].lower() if "@" in recipient_email else ""
    if recipient_domain and recipient_domain in set(settings.EMAIL_NOTIFICATIONS_SKIP_DOMAINS or []):
        return
    body = _build_email_body(notification)
    try:
        send_mail(
            subject=notification.title or "Уведомление",
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
        )
    except Exception:
        logger.exception("Failed to send notification email to %s", recipient_email)


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
        for notification in objects:
            _send_notification_email(notification)
