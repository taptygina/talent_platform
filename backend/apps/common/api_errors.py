from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


def error_response(*, code: str, message: str, details=None, http_status: int = status.HTTP_400_BAD_REQUEST) -> Response:
    return Response(
        {
            "code": code,
            "message": message,
            "details": details,
        },
        status=http_status,
    )


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return response

    data = response.data
    if isinstance(data, dict) and {"code", "message", "details"}.issubset(set(data.keys())):
        return response

    if isinstance(data, dict):
        message = data.get("detail")
        details = None
        if message is None:
            message = "Ошибка валидации запроса."
            details = data
        code = "validation_error" if response.status_code == status.HTTP_400_BAD_REQUEST else "api_error"
    else:
        message = str(data)
        details = None
        code = "api_error"

    if response.status_code == status.HTTP_401_UNAUTHORIZED:
        code = "unauthorized"
    elif response.status_code == status.HTTP_403_FORBIDDEN:
        code = "permission_denied"
    elif response.status_code == status.HTTP_404_NOT_FOUND:
        code = "not_found"
    elif response.status_code >= 500:
        code = "server_error"
        if not message:
            message = "Внутренняя ошибка сервера."

    response.data = {
        "code": code,
        "message": message or "Ошибка запроса.",
        "details": details,
    }
    return response
