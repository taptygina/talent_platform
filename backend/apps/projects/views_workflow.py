from django.utils import timezone
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.notifications.models import NotificationType
from apps.notifications.services import create_notifications
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
from apps.projects.template_utils import build_template_editor_profile, render_placeholders
from apps.projects.serializers import (
    ProjectStageReviewSerializer,
    ProjectStageSubmissionFileSerializer,
    ProjectStageSubmissionSerializer,
    ProjectTemplateSectionSerializer,
    ProjectTemplateSerializer,
    StageMaterialSerializer,
)
from apps.users.models import User, UserRole


class ProjectTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectTemplateSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    filterset_fields = ("project_type", "is_active")
    search_fields = ("name", "description")
    ordering_fields = ("name", "created_at")

    def get_queryset(self):
        return ProjectTemplate.objects.prefetch_related("sections").select_related("created_by")

    def perform_create(self, serializer):
        if self.request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            raise permissions.PermissionDenied("Недостаточно прав.")
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        if self.request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            raise permissions.PermissionDenied("Недостаточно прав.")
        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            raise permissions.PermissionDenied("Недостаточно прав.")
        instance.delete()

    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAuthenticated], url_path="editor-profile")
    def editor_profile(self, request, pk=None):
        template = self.get_object()
        return Response(build_template_editor_profile(template), status=status.HTTP_200_OK)


class ProjectTemplateSectionViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectTemplateSectionSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ("template", "order")
    ordering_fields = ("order", "id")

    def get_queryset(self):
        return ProjectTemplateSection.objects.select_related("template")

    def perform_create(self, serializer):
        if self.request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            raise permissions.PermissionDenied("Недостаточно прав.")
        serializer.save()

    def perform_update(self, serializer):
        if self.request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            raise permissions.PermissionDenied("Недостаточно прав.")
        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            raise permissions.PermissionDenied("Недостаточно прав.")
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
        raise permissions.PermissionDenied("Недостаточно прав.")

    def perform_destroy(self, instance):
        user = self.request.user
        if user.role in {UserRole.CURATOR, UserRole.ADMIN}:
            instance.delete()
            return
        if user.role == UserRole.TEACHER and instance.stage.project.supervisor_id == user.id:
            instance.delete()
            return
        raise permissions.PermissionDenied("Недостаточно прав.")


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
                raise permissions.PermissionDenied("Вы не являетесь участником этого проекта.")
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
                raise serializers.ValidationError({"student_id": "Для сотрудников обязательно укажите student_id."})
            if student.role != UserRole.STUDENT:
                raise serializers.ValidationError({"student_id": "Можно выбрать только пользователя с ролью «Студент»."})
            if not stage.project.participants.filter(id=student.id).exists():
                raise serializers.ValidationError({"student_id": "Выбранный студент не является участником проекта."})
            submission_text = base_text or render_placeholders(
                stage.task_text or "",
                student=student,
                supervisor=stage.project.supervisor,
                project=stage.project,
            )
            serializer.save(student=student, submission_text=submission_text)
            return
        raise permissions.PermissionDenied("Недостаточно прав.")

    def update(self, request, *args, **kwargs):
        submission = self.get_object()
        user = request.user
        if user.role == UserRole.STUDENT and submission.student_id != user.id:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        if user.role == UserRole.STUDENT:
            allowed_fields = {"submission_text"}
            if any(field not in allowed_fields for field in request.data.keys()):
                return Response({"detail": "Студент может изменять только текст сдачи этапа."}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def submit(self, request, pk=None):
        submission = self.get_object()
        user = request.user
        if user.role != UserRole.STUDENT or submission.student_id != user.id:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
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
            title="Этап отправлен на проверку",
            message=f"{user.full_name or user.username} отправил этап «{submission.stage.title}».",
        )
        return Response({"detail": "Сдача этапа отправлена на проверку."}, status=status.HTTP_200_OK)


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
        raise permissions.PermissionDenied("Недостаточно прав.")

    def perform_destroy(self, instance):
        user = self.request.user
        if user.role == UserRole.STUDENT and instance.submission.student_id == user.id:
            instance.delete()
            return
        if user.role in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            instance.delete()
            return
        raise permissions.PermissionDenied("Недостаточно прав.")


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
            raise permissions.PermissionDenied("Недостаточно прав.")

        if decision == StageReviewDecision.APPROVED:
            submission.status = StageSubmissionStatus.APPROVED
            submission.checked_at = timezone.now()
            stage_status = StageStatus.APPROVED
            notif_message = f"Этап «{submission.stage.title}» принят."
        else:
            submission.status = StageSubmissionStatus.NEEDS_CHANGES
            submission.checked_at = timezone.now()
            stage_status = StageStatus.CHANGES_REQUESTED
            notif_message = f"Этап «{submission.stage.title}» отправлен на доработку."

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
            title="Результат проверки этапа",
            message=notif_message,
        )
