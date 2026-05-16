from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.files.storage import default_storage
from django.http import HttpResponse
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
import logging
from rest_framework import permissions, status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.file_security import FileValidationError, UploadPolicy, sanitize_filename, validate_uploaded_file
from apps.users.models import SystemSetting, UserRole
from apps.users.serializers import SelfProfileSerializer, SystemSettingSerializer, UserManageSerializer, UserSerializer
from apps.users.services import build_credentials_pdf, build_import_template_xlsx, import_users_from_xlsx
from apps.users.tasks import send_password_reset_email_task

USERNAME_MIN_LEN = 3
USERNAME_MAX_LEN = 30
PASSWORD_MIN_LEN = 8
MAX_IMPORT_XLSX_SIZE = 3 * 1024 * 1024
MAX_AVATAR_SIZE = 5 * 1024 * 1024
logger = logging.getLogger(__name__)


def _send_password_reset_email_async(*, recipient_email: str, reset_link: str) -> None:
    try:
        send_password_reset_email_task.delay(recipient_email=recipient_email, reset_link=reset_link)
    except Exception:
        # Без брокера не роняем пользовательский запрос: отправляем письмо синхронно.
        logger.exception("Celery unavailable for password reset email; fallback to sync send")
        send_password_reset_email_task(recipient_email=recipient_email, reset_link=reset_link)


def _set_auth_cookies(response: Response, refresh: RefreshToken) -> None:
    response.set_cookie(
        "access_token",
        str(refresh.access_token),
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Lax",
        max_age=60 * 30,
    )
    response.set_cookie(
        "refresh_token",
        str(refresh),
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Lax",
        max_age=60 * 60 * 24 * 7,
    )


def _get_or_create_system_settings() -> SystemSetting:
    settings_obj = SystemSetting.objects.order_by("id").first()
    if settings_obj:
        return settings_obj
    return SystemSetting.objects.create()


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""
        if len(username) < USERNAME_MIN_LEN or len(username) > USERNAME_MAX_LEN:
            return Response({"detail": "Логин должен содержать от 3 до 30 символов."}, status=status.HTTP_400_BAD_REQUEST)
        if len(password) < PASSWORD_MIN_LEN:
            return Response({"detail": "Пароль должен содержать минимум 8 символов."}, status=status.HTTP_400_BAD_REQUEST)
        user = authenticate(request, username=username, password=password)
        if not user:
            return Response({"detail": "Неверный логин или пароль."}, status=status.HTTP_401_UNAUTHORIZED)

        refresh = RefreshToken.for_user(user)
        response = Response(
            {
                "user": UserSerializer(user).data,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "token_type": "Bearer",
            },
            status=status.HTTP_200_OK,
        )
        _set_auth_cookies(response, refresh)
        return response


class RefreshView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        token = request.COOKIES.get("refresh_token") or request.data.get("refresh")
        if not token:
            return Response({"detail": "Требуется refresh-токен."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            old_refresh = RefreshToken(token)
            user_id = old_refresh.get("user_id")
            user = get_user_model().objects.get(id=user_id)
            new_refresh = RefreshToken.for_user(user)
            # Инвалидируем старый refresh после успешной выдачи нового.
            old_refresh.blacklist()
        except Exception:
            return Response({"detail": "Некорректный refresh-токен."}, status=status.HTTP_401_UNAUTHORIZED)

        response = Response(
            {
                "access": str(new_refresh.access_token),
                "refresh": str(new_refresh),
                "token_type": "Bearer",
            },
            status=status.HTTP_200_OK,
        )
        _set_auth_cookies(response, new_refresh)
        return response


class LogoutView(APIView):
    def post(self, request):
        token = request.COOKIES.get("refresh_token") or request.data.get("refresh")
        if token:
            try:
                RefreshToken(token).blacklist()
            except Exception:
                logger.warning("Could not blacklist refresh token during logout")
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie("access_token")
        response.delete_cookie("refresh_token")
        return response


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = SelfProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        old_password = request.data.get("old_password") or ""
        new_password = request.data.get("new_password") or ""
        if not old_password:
            return Response({"detail": "Укажите текущий пароль."}, status=status.HTTP_400_BAD_REQUEST)
        if len(new_password) < PASSWORD_MIN_LEN:
            return Response({"detail": "Пароль должен содержать минимум 8 символов."}, status=status.HTTP_400_BAD_REQUEST)
        if not request.user.check_password(old_password):
            return Response({"detail": "Текущий пароль указан неверно."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(new_password, request.user)
        except Exception as exc:
            message = getattr(exc, "messages", None)
            if isinstance(message, list) and message:
                return Response({"detail": message[0]}, status=status.HTTP_400_BAD_REQUEST)
            return Response({"detail": "Новый пароль не соответствует требованиям безопасности."}, status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(new_password)
        request.user.save(update_fields=["password"])
        return Response({"detail": "Пароль успешно изменен."}, status=status.HTTP_200_OK)


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        if not email:
            return Response({"detail": "Укажите email."}, status=status.HTTP_400_BAD_REQUEST)

        user = get_user_model().objects.filter(email__iexact=email, is_active=True).first()
        if not user:
            return Response({"detail": "Пользователь с такой почтой не найден."}, status=status.HTTP_404_NOT_FOUND)

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
        _send_password_reset_email_async(recipient_email=user.email, reset_link=reset_link)

        return Response({"detail": "Письмо для восстановления отправлено."}, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        uid = request.data.get("uid") or ""
        token = request.data.get("token") or ""
        new_password = request.data.get("new_password") or ""
        if not uid or not token:
            return Response({"detail": "Ссылка восстановления недействительна."}, status=status.HTTP_400_BAD_REQUEST)
        if len(new_password) < PASSWORD_MIN_LEN:
            return Response({"detail": "Пароль должен содержать минимум 8 символов."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = get_user_model().objects.get(pk=user_id, is_active=True)
        except Exception:
            return Response({"detail": "Ссылка восстановления недействительна или устарела."}, status=status.HTTP_400_BAD_REQUEST)

        if not default_token_generator.check_token(user, token):
            return Response({"detail": "Ссылка восстановления недействительна или устарела."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_password(new_password, user)
        except Exception as exc:
            message = getattr(exc, "messages", None)
            if isinstance(message, list) and message:
                return Response({"detail": message[0]}, status=status.HTTP_400_BAD_REQUEST)
            return Response({"detail": "Новый пароль не соответствует требованиям безопасности."}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save(update_fields=["password"])
        return Response({"detail": "Пароль успешно восстановлен."}, status=status.HTTP_200_OK)


class SystemSettingsView(APIView):
    def get(self, request):
        if request.user.role not in {UserRole.CURATOR, UserRole.ADMIN}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        settings_obj = _get_or_create_system_settings()
        return Response(SystemSettingSerializer(settings_obj).data)

    def patch(self, request):
        if request.user.role not in {UserRole.CURATOR, UserRole.ADMIN}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        settings_obj = _get_or_create_system_settings()
        serializer = SystemSettingSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ImportUsersView(APIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        if request.user.role not in {UserRole.CURATOR, UserRole.ADMIN}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)

        role = request.data.get("role", UserRole.STUDENT)
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "Требуется файл."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_uploaded_file(
                upload,
                policy=UploadPolicy(
                    allowed_extensions={".xlsx"},
                    max_size_bytes=MAX_IMPORT_XLSX_SIZE,
                    allow_office=True,
                ),
            )
        except FileValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = import_users_from_xlsx(upload.read(), role)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "created": result.created,
                "skipped": result.skipped,
                "errors": result.errors,
                "generated_accounts": result.generated_accounts,
            },
            status=status.HTTP_201_CREATED,
        )


class ImportUsersTemplateView(APIView):
    def get(self, request):
        if request.user.role not in {UserRole.CURATOR, UserRole.ADMIN}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)

        content = build_import_template_xlsx()
        response = HttpResponse(
            content,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = 'attachment; filename="users-import-template.xlsx"'
        return response


class ImportCredentialsPdfView(APIView):
    def post(self, request):
        if request.user.role not in {UserRole.CURATOR, UserRole.ADMIN}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)

        accounts = request.data.get("accounts")
        role = request.data.get("role", "student")
        if not isinstance(accounts, list) or not accounts:
            return Response({"detail": "Передайте непустой список accounts."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            content = build_credentials_pdf(accounts, role)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        response = HttpResponse(content, content_type="application/pdf")
        response["Content-Disposition"] = 'attachment; filename="generated-credentials.pdf"'
        return response


class UploadAvatarView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if request.user.role not in {UserRole.CURATOR, UserRole.ADMIN, UserRole.TEACHER, UserRole.METHODIST, UserRole.STUDENT}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)

        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "Требуется файл."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_uploaded_file(
                uploaded,
                policy=UploadPolicy(
                    allowed_extensions={".jpg", ".jpeg", ".png", ".webp", ".gif"},
                    max_size_bytes=MAX_AVATAR_SIZE,
                    allow_images=True,
                ),
            )
        except FileValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        safe_name = sanitize_filename(uploaded.name, default_stem="avatar")
        saved_path = default_storage.save(f"user_avatars/{safe_name}", uploaded).replace("\\", "/")
        media_url = f"{settings.MEDIA_URL}{saved_path}"
        absolute_url = request.build_absolute_uri(media_url)

        return Response({"avatar_url": absolute_url}, status=status.HTTP_201_CREATED)


class UserManageViewSet(viewsets.ModelViewSet):
    serializer_class = UserManageSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]
    filterset_fields = ("role", "is_active", "is_verified", "group_name")
    search_fields = ("username", "first_name", "last_name", "middle_name", "email", "group_name")
    ordering_fields = ("username", "last_name", "date_joined", "last_login")

    def get_queryset(self):
        if self.request.user.role not in {UserRole.CURATOR, UserRole.ADMIN}:
            return get_user_model().objects.none()
        return get_user_model().objects.all()

    def update(self, request, *args, **kwargs):
        is_partial = bool(kwargs.get("partial"))
        if not is_partial:
            return Response({"detail": "Метод не разрешен. Используйте PATCH."}, status=status.HTTP_405_METHOD_NOT_ALLOWED)
        if request.user.role not in {UserRole.CURATOR, UserRole.ADMIN}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)
