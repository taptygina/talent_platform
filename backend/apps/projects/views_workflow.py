from django.utils import timezone
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.common.api_errors import error_response
from apps.file_security import FileValidationError, UploadPolicy, validate_uploaded_file
from apps.notifications.models import NotificationType
from apps.notifications.services import create_notifications
from apps.projects.api_messages import MESSAGES
from apps.projects.models import (
    ProjectStatus,
    ProjectStageReview,
    ProjectStageSubmission,
    ProjectStageSubmissionFile,
    ProjectTemplate,
    ProjectTemplateSection,
    StageMaterial,
    StageReviewDecision,
    StageStatus,
    StageSubmissionStatus,
)
from apps.projects.template_utils import (
    BUILDER_CONDITION_KEYS,
    BUILDER_REPEAT_SOURCES,
    BUILDER_VARIABLES,
    build_template_editor_profile,
    default_builder_schema,
    extract_template_sections_from_docx,
    preview_template_sections_from_docx_bytes,
    render_builder_blocks,
    render_placeholders,
)
from apps.projects.serializers import (
    ProjectStageReviewSerializer,
    ProjectStageSubmissionFileSerializer,
    ProjectStageSubmissionSerializer,
    ProjectTemplateSectionSerializer,
    ProjectTemplateSerializer,
    StageMaterialSerializer,
)
from apps.users.models import User, UserRole

TEMPLATE_PREVIEW_MAX_SIZE = 8 * 1024 * 1024


class ProjectTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectTemplateSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ("project_type", "is_active")
    search_fields = ("name", "description")
    ordering_fields = ("name", "created_at")

    def get_queryset(self):
        return ProjectTemplate.objects.prefetch_related("sections").select_related("created_by")

    def _ensure_manage_permission(self):
        if self.request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            raise permissions.PermissionDenied(MESSAGES["permission_denied"])

    def perform_create(self, serializer):
        if self.request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            raise permissions.PermissionDenied(MESSAGES["permission_denied"])

        upload = self.request.FILES.get("template_file")
        if upload:
            try:
                validate_uploaded_file(
                    upload,
                    policy=UploadPolicy(
                        allowed_extensions={".docx"},
                        max_size_bytes=TEMPLATE_PREVIEW_MAX_SIZE,
                        allow_office=True,
                    ),
                )
            except FileValidationError as exc:
                raise serializers.ValidationError({"template_file": str(exc)})

        template = serializer.save(
            created_by=self.request.user,
            builder_schema=serializer.validated_data.get("builder_schema") or default_builder_schema(),
        )
        if upload:
            extract_template_sections_from_docx(template, overwrite=False)

    def perform_update(self, serializer):
        if self.request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            raise permissions.PermissionDenied(MESSAGES["permission_denied"])
        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            raise permissions.PermissionDenied(MESSAGES["permission_denied"])
        instance.delete()

    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAuthenticated], url_path="editor-profile")
    def editor_profile(self, request, pk=None):
        template = self.get_object()
        return Response(build_template_editor_profile(template), status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAuthenticated], url_path="builder-meta")
    def builder_meta(self, request, pk=None):
        template = self.get_object()
        return Response(
            {
                "schema": template.builder_schema or default_builder_schema(),
                "variables": BUILDER_VARIABLES,
                "conditions": sorted(BUILDER_CONDITION_KEYS),
                "repeat_sources": sorted(BUILDER_REPEAT_SOURCES),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated], url_path="builder-preview")
    def builder_preview(self, request, pk=None):
        self._ensure_manage_permission()
        template = self.get_object()
        schema = request.data.get("schema") or template.builder_schema or default_builder_schema()
        return Response(
            {"blocks": render_builder_blocks(schema)},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAuthenticated], url_path="template-preview")
    def template_preview(self, request, pk=None):
        template = self.get_object()
        if template.builder_schema:
            blocks = render_builder_blocks(template.builder_schema)
            source = "builder"
        else:
            blocks = []
            for section in template.sections.order_by("order", "id"):
                blocks.append({"type": "heading", "level": 2, "text": section.title})
                if section.default_task:
                    blocks.append({"type": "paragraph", "level": 1, "text": section.default_task})
            source = "sections"

        return Response(
            {
                "template": {
                    "id": template.id,
                    "name": template.name,
                    "description": template.description,
                    "project_type": template.project_type,
                    "is_active": template.is_active,
                    "sections_count": template.sections.count(),
                    "has_docx_file": bool(template.template_file),
                    "has_builder_schema": bool(template.builder_schema),
                },
                "source": source,
                "blocks": blocks,
            },
            status=status.HTTP_200_OK,
        )
    @action(detail=False, methods=["post"], permission_classes=[permissions.IsAuthenticated], url_path="preview-sections")
    def preview_sections(self, request):
        if request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            return error_response(code="permission_denied", message=MESSAGES["permission_denied"], http_status=status.HTTP_403_FORBIDDEN)

        upload = request.FILES.get("template_file")
        if not upload:
            return Response({"detail": "РџРµСЂРµРґР°Р№С‚Рµ .docx С„Р°Р№Р» РґР»СЏ РїСЂРµРґРїСЂРѕСЃРјРѕС‚СЂР°."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_uploaded_file(
                upload,
                policy=UploadPolicy(
                    allowed_extensions={".docx"},
                    max_size_bytes=TEMPLATE_PREVIEW_MAX_SIZE,
                    allow_office=True,
                ),
            )
        except FileValidationError as exc:
            return error_response(code="invalid_request", message=str(exc), http_status=status.HTTP_400_BAD_REQUEST)

        titles = preview_template_sections_from_docx_bytes(upload.read())
        return Response({"titles": titles, "count": len(titles)}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated], url_path="soft-delete")
    def soft_delete(self, request, pk=None):
        template = self.get_object()
        self._ensure_manage_permission()
        if not template.is_active:
            return Response({"detail": MESSAGES["already_inactive"]}, status=status.HTTP_200_OK)
        template.is_active = False
        template.save(update_fields=["is_active"])
        return Response({"detail": MESSAGES["archived_success"], "is_active": template.is_active}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated], url_path="restore")
    def restore(self, request, pk=None):
        template = self.get_object()
        self._ensure_manage_permission()
        if template.is_active:
            return Response({"detail": MESSAGES["already_active"]}, status=status.HTTP_200_OK)
        template.is_active = True
        template.save(update_fields=["is_active"])
        return Response({"detail": MESSAGES["restored_success"], "is_active": template.is_active}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["delete"], permission_classes=[permissions.IsAuthenticated], url_path="hard-delete")
    def hard_delete(self, request, pk=None):
        template = self.get_object()
        self._ensure_manage_permission()
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated], url_path="extract-sections")
    def extract_sections(self, request, pk=None):
        template = self.get_object()
        if request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            return error_response(code="permission_denied", message=MESSAGES["permission_denied"], http_status=status.HTTP_403_FORBIDDEN)

        overwrite = str(request.data.get("overwrite", "true")).lower() not in {"0", "false", "no"}
        created_count = extract_template_sections_from_docx(template, overwrite=overwrite)
        if created_count == 0:
            return Response(
                {
                    "detail": "Р—Р°РіРѕР»РѕРІРєРё РІ С„Р°Р№Р»Рµ С€Р°Р±Р»РѕРЅР° РЅРµ РЅР°Р№РґРµРЅС‹. РџСЂРѕРІРµСЂСЊС‚Рµ СЃС‚РёР»Рё Р·Р°РіРѕР»РѕРІРєРѕРІ РІ .docx."},
                status=status.HTTP_200_OK,
            )

        return Response(
            {
                "detail": f"Р Р°Р·РґРµР»С‹ С€Р°Р±Р»РѕРЅР° СѓСЃРїРµС€РЅРѕ СЃРѕР·РґР°РЅС‹: {created_count}.",
                "created_sections": created_count,
            },
            status=status.HTTP_200_OK,
        )


class ProjectTemplateSectionViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectTemplateSectionSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ("template", "order")
    ordering_fields = ("order", "id")

    def get_queryset(self):
        return ProjectTemplateSection.objects.select_related("template")

    def perform_create(self, serializer):
        if self.request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            raise permissions.PermissionDenied(MESSAGES["permission_denied"])
        serializer.save()

    def perform_update(self, serializer):
        if self.request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            raise permissions.PermissionDenied(MESSAGES["permission_denied"])
        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            raise permissions.PermissionDenied(MESSAGES["permission_denied"])
        instance.delete()


class StageMaterialViewSet(viewsets.ModelViewSet):
    serializer_class = StageMaterialSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    filterset_fields = ("stage",)
    ordering_fields = ("created_at",)

    def get_queryset(self):
        queryset = StageMaterial.objects.select_related("stage", "stage__project", "uploaded_by")
        user = self.request.user
        if user.role == UserRole.STUDENT:
            return queryset.filter(stage__project__participants=user)
        if user.role == UserRole.TEACHER:
            return queryset.filter(stage__project__supervisor=user)
        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        stage = serializer.validated_data["stage"]
        if user.role in {UserRole.CURATOR, UserRole.ADMIN}:
            serializer.save(uploaded_by=user)
            return
        if user.role == UserRole.TEACHER and stage.project.supervisor_id == user.id:
            serializer.save(uploaded_by=user)
            return
        raise permissions.PermissionDenied(MESSAGES["permission_denied"])

    def perform_destroy(self, instance):
        user = self.request.user
        if user.role in {UserRole.CURATOR, UserRole.ADMIN}:
            instance.delete()
            return
        if user.role == UserRole.TEACHER and instance.stage.project.supervisor_id == user.id:
            instance.delete()
            return
        raise permissions.PermissionDenied(MESSAGES["permission_denied"])


class ProjectStageSubmissionViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectStageSubmissionSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = ("stage", "student", "status")
    ordering_fields = ("updated_at", "submitted_at", "checked_at")

    def get_queryset(self):
        queryset = ProjectStageSubmission.objects.select_related("stage", "stage__project", "student").prefetch_related("files")
        user = self.request.user
        if user.role == UserRole.STUDENT:
            return queryset.filter(student=user)
        if user.role == UserRole.TEACHER:
            return queryset.filter(stage__project__supervisor=user)
        if user.role in {UserRole.CURATOR, UserRole.ADMIN}:
            return queryset
        return queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        stage = serializer.validated_data["stage"]
        base_text = (serializer.validated_data.get("submission_text") or "").strip()
        if user.role == UserRole.STUDENT:
            if not stage.project.participants.filter(id=user.id).exists():
                raise permissions.PermissionDenied(MESSAGES["permission_denied"])
            submission_text = base_text or render_placeholders(
                stage.task_text or "",
                student=user,
                supervisor=stage.project.supervisor,
                project=stage.project,
            )
            serializer.save(student=user, submission_text=submission_text)
            return
        if user.role in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            student = serializer.validated_data.get("student")
            if not student:
                raise serializers.ValidationError({"student_id": "Р”Р»СЏ СЃРѕС‚СЂСѓРґРЅРёРєРѕРІ РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ СѓРєР°Р¶РёС‚Рµ student_id."})
            if student.role != UserRole.STUDENT:
                raise serializers.ValidationError({"student_id": "РњРѕР¶РЅРѕ РІС‹Р±СЂР°С‚СЊ С‚РѕР»СЊРєРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ СЃ СЂРѕР»СЊСЋ В«РЎС‚СѓРґРµРЅС‚В»."})
            if not stage.project.participants.filter(id=student.id).exists():
                raise serializers.ValidationError({"student_id": "Р’С‹Р±СЂР°РЅРЅС‹Р№ СЃС‚СѓРґРµРЅС‚ РЅРµ СЏРІР»СЏРµС‚СЃСЏ СѓС‡Р°СЃС‚РЅРёРєРѕРј РїСЂРѕРµРєС‚Р°."})
            submission_text = base_text or render_placeholders(
                stage.task_text or "",
                student=student,
                supervisor=stage.project.supervisor,
                project=stage.project,
            )
            serializer.save(student=student, submission_text=submission_text)
            return
        raise permissions.PermissionDenied(MESSAGES["permission_denied"])

    def update(self, request, *args, **kwargs):
        submission = self.get_object()
        user = request.user
        if user.role == UserRole.STUDENT and submission.student_id != user.id:
            return error_response(code="permission_denied", message=MESSAGES["permission_denied"], http_status=status.HTTP_403_FORBIDDEN)
        if user.role == UserRole.STUDENT:
            allowed_fields = {"submission_text"}
            if any(field not in allowed_fields for field in request.data.keys()):
                return error_response(code="permission_denied", message=MESSAGES["permission_denied"], http_status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def submit(self, request, pk=None):
        submission = self.get_object()
        user = request.user
        if user.role != UserRole.STUDENT or submission.student_id != user.id:
            return error_response(code="permission_denied", message=MESSAGES["permission_denied"], http_status=status.HTTP_403_FORBIDDEN)
        submission.status = StageSubmissionStatus.SUBMITTED
        submission.submitted_at = timezone.now()
        submission.save(update_fields=["status", "submitted_at", "updated_at"])

        recipients = [submission.stage.project.supervisor] + list(
            User.objects.filter(role__in=[UserRole.CURATOR, UserRole.ADMIN], is_active=True)
        )
        create_notifications(
            recipients,
            actor=user,
            project=submission.stage.project,
            stage=submission.stage,
            type=NotificationType.STAGE_SUBMITTED,
            title="Р­С‚Р°Рї РѕС‚РїСЂР°РІР»РµРЅ РЅР° РїСЂРѕРІРµСЂРєСѓ",
            message=f"{user.full_name or user.username} РѕС‚РїСЂР°РІРёР» СЌС‚Р°Рї В«{submission.stage.title}В».",
        )
        return Response({"detail": "РЎРґР°С‡Р° СЌС‚Р°РїР° РѕС‚РїСЂР°РІР»РµРЅР° РЅР° РїСЂРѕРІРµСЂРєСѓ."}, status=status.HTTP_200_OK)


class ProjectStageSubmissionFileViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectStageSubmissionFileSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "delete", "head", "options"]
    parser_classes = [MultiPartParser, FormParser]
    filterset_fields = ("submission",)
    ordering_fields = ("uploaded_at",)

    def get_queryset(self):
        queryset = ProjectStageSubmissionFile.objects.select_related("submission", "submission__stage", "submission__student")
        user = self.request.user
        if user.role == UserRole.STUDENT:
            return queryset.filter(submission__student=user)
        if user.role == UserRole.TEACHER:
            return queryset.filter(submission__stage__project__supervisor=user)
        if user.role in {UserRole.CURATOR, UserRole.ADMIN}:
            return queryset
        return queryset.none()

    def perform_create(self, serializer):
        submission = serializer.validated_data["submission"]
        user = self.request.user
        if user.role == UserRole.STUDENT and submission.student_id == user.id:
            serializer.save()
            return
        if user.role in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            serializer.save()
            return
        raise permissions.PermissionDenied(MESSAGES["permission_denied"])

    def perform_destroy(self, instance):
        user = self.request.user
        if user.role == UserRole.STUDENT and instance.submission.student_id == user.id:
            instance.delete()
            return
        if user.role in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            instance.delete()
            return
        raise permissions.PermissionDenied(MESSAGES["permission_denied"])


class ProjectStageReviewViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectStageReviewSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = ("submission", "decision")
    ordering_fields = ("created_at",)

    def get_queryset(self):
        queryset = ProjectStageReview.objects.select_related("submission", "submission__stage", "submission__student", "teacher")
        user = self.request.user
        if user.role == UserRole.STUDENT:
            return queryset.filter(submission__student=user)
        if user.role == UserRole.TEACHER:
            return queryset.filter(submission__stage__project__supervisor=user)
        if user.role in {UserRole.CURATOR, UserRole.ADMIN}:
            return queryset
        return queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        submission = serializer.validated_data["submission"]
        decision = serializer.validated_data["decision"]

        if user.role in {UserRole.CURATOR, UserRole.ADMIN}:
            review = serializer.save(teacher=user)
        elif user.role == UserRole.TEACHER and submission.stage.project.supervisor_id == user.id:
            review = serializer.save(teacher=user)
        else:
            raise permissions.PermissionDenied(MESSAGES["permission_denied"])

        if decision == StageReviewDecision.APPROVED:
            submission.status = StageSubmissionStatus.APPROVED
            submission.checked_at = timezone.now()
            stage_status = StageStatus.APPROVED
            notif_message = f"Р­С‚Р°Рї В«{submission.stage.title}В» РїСЂРёРЅСЏС‚."
        else:
            submission.status = StageSubmissionStatus.NEEDS_CHANGES
            submission.checked_at = timezone.now()
            stage_status = StageStatus.CHANGES_REQUESTED
            notif_message = f"Р­С‚Р°Рї В«{submission.stage.title}В» РѕС‚РїСЂР°РІР»РµРЅ РЅР° РґРѕСЂР°Р±РѕС‚РєСѓ."

        submission.save(update_fields=["status", "checked_at", "updated_at"])
        submission.stage.status = stage_status
        submission.stage.teacher_feedback = review.comment or submission.stage.teacher_feedback
        submission.stage.updated_by = user
        submission.stage.save(update_fields=["status", "teacher_feedback", "updated_by", "updated_at"])

        project = submission.stage.project
        if project.stages.exists() and not project.stages.exclude(status=StageStatus.APPROVED).exists():
            if project.status != ProjectStatus.DONE:
                project.status = ProjectStatus.DONE
                project.save(update_fields=["status", "updated_at"])

        create_notifications(
            [submission.student],
            actor=user,
            project=submission.stage.project,
            stage=submission.stage,
            type=NotificationType.STAGE_REVIEWED,
            title="Р РµР·СѓР»СЊС‚Р°С‚ РїСЂРѕРІРµСЂРєРё СЌС‚Р°РїР°",
            message=notif_message,
        )

