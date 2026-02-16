from rest_framework.permissions import BasePermission, SAFE_METHODS

from apps.users.models import UserRole


class IsCuratorOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.role in {UserRole.CURATOR, UserRole.ADMIN}


class IsTeacherCuratorOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.role in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}
