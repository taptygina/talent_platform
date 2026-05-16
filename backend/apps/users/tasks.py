import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 5},
)
def send_password_reset_email_task(self, recipient_email: str, reset_link: str) -> None:
    body = (
        "Здравствуйте!\n\n"
        "Вы запросили восстановление пароля на платформе \"Инженерия проектов\".\n"
        f"Перейдите по ссылке, чтобы задать новый пароль:\n{reset_link}\n\n"
        "Если вы не запрашивали восстановление, просто проигнорируйте это письмо."
    )
    send_mail(
        subject="Восстановление пароля",
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[recipient_email],
        fail_silently=False,
    )
    logger.info("Password reset email sent to %s", recipient_email)

