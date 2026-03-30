from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.core.files.storage import default_storage
from django.http import HttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import SystemSetting, UserRole
from apps.users.serializers import SelfProfileSerializer, SystemSettingSerializer, UserManageSerializer, UserSerializer
from apps.users.services import build_credentials_pdf, build_import_template_xlsx, import_users_from_xlsx


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
        username = request.data.get("username")
        password = request.data.get("password")
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
            refresh = RefreshToken(token)
            user_id = refresh.get("user_id")
            user = get_user_model().objects.get(id=user_id)
            new_refresh = RefreshToken.for_user(user)
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
        if not upload.name.lower().endswith(".xlsx"):
            return Response({"detail": "Поддерживаются только .xlsx файлы."}, status=status.HTTP_400_BAD_REQUEST)

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

        content = build_credentials_pdf(accounts, role)
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

        allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
        if uploaded.content_type not in allowed_types:
            return Response({"detail": "Разрешены только изображения."}, status=status.HTTP_400_BAD_REQUEST)

        saved_path = default_storage.save(f"user_avatars/{uploaded.name}", uploaded).replace("\\", "/")
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
