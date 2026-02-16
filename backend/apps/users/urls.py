from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.users.views import (
    ImportCredentialsPdfView,
    ImportUsersTemplateView,
    ImportUsersView,
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
    UploadAvatarView,
    UserManageViewSet,
)

router = DefaultRouter()
router.register(r"users", UserManageViewSet, basename="users-manage")

urlpatterns = [
    path("", include(router.urls)),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("upload-avatar/", UploadAvatarView.as_view(), name="upload-avatar"),
    path("import-users/", ImportUsersView.as_view(), name="import-users"),
    path("import-users/template/", ImportUsersTemplateView.as_view(), name="import-users-template"),
    path("import-users/credentials-pdf/", ImportCredentialsPdfView.as_view(), name="import-users-credentials-pdf"),
]
