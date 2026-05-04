from datetime import timedelta
import threading

from django.db import close_old_connections
from django.db.models import BooleanField, Count, Exists, OuterRef, Q, Value
from django.core.files.storage import default_storage
from django.utils.dateparse import parse_date
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from django.conf import settings

from apps.notifications.models import NotificationType
from apps.notifications.services import create_notifications
from apps.projects.filters import ProjectFilter
from apps.projects.models import (
    Project,
    ProjectComment,
    ProjectLike,
    ProjectStage,
    ProjectStatus,
    ProjectSupervisorInvite,
    StageStatus,
    SupervisorInviteStatus,
    Team,
)
from apps.projects.permissions import IsCuratorOrReadOnly, IsTeacherCuratorOrReadOnly
from apps.projects.serializers import (
    ProjectCommentSerializer,
    ProjectDetailSerializer,
    ProjectLikeSerializer,
    ProjectListSerializer,
    ProjectSupervisorInviteSerializer,
    ProjectStageSerializer,
    TeamManageSerializer,
    TeamSerializer,
)
from apps.users.models import User, UserRole


class ProjectViewSet(viewsets.ModelViewSet):
    filterset_class = ProjectFilter
    search_fields = ("title", "description", "goal", "supervisor__first_name", "supervisor__last_name", "team__name")
    ordering_fields = ("created_at", "start_date", "end_date", "title", "status")

    def get_queryset(self):
        # Считаем агрегаты заранее, чтобы избежать лишних дополнительных запросов в списках и карточках.
        queryset = (
            Project.objects.select_related("supervisor", "team")
            .prefetch_related("participants", "team__members")
            .annotate(
                participants_count=Count("participants", distinct=True),
                likes_count=Count("likes", distinct=True),
                comments_count=Count("comments", distinct=True),
            )
        )
        if self.request.user.is_authenticated:
            queryset = queryset.annotate(
                liked_by_me=Exists(ProjectLike.objects.filter(project_id=OuterRef("pk"), user_id=self.request.user.id))
            )
        else:
            queryset = queryset.annotate(liked_by_me=Value(False, output_field=BooleanField()))
        if self.action == "list":
            # Архив по умолчанию скрыт и показывается только по явному флагу.
            include_archived = (self.request.query_params.get("include_archived") or "").strip().lower()
            if include_archived not in {"1", "true", "yes"}:
                queryset = queryset.filter(is_archived=False)
        return queryset

    def get_serializer_class(self):
        if self.action == "list":
            return ProjectListSerializer
        return ProjectDetailSerializer

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy"}:
            return [IsTeacherCuratorOrReadOnly()]
        return [permissions.IsAuthenticated()]

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def groups(self, request):
        search = (request.query_params.get("search") or "").strip()
        queryset = User.objects.filter(role=UserRole.STUDENT)
        if search:
            queryset = queryset.filter(group_name__icontains=search)
        groups = (
            queryset
            .exclude(group_name="")
            .values("group_name")
            .annotate(students_count=Count("id"))
            .order_by("group_name")
        )[:100]
        return Response(list(groups))

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def teams(self, request):
        queryset = Team.objects.exclude(name__startswith="group:").prefetch_related("members").select_related("supervisor")
        serializer = TeamSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def students(self, request):
        search = (request.query_params.get("search") or "").strip()
        group_name = (request.query_params.get("group_name") or "").strip()
        queryset = User.objects.filter(role=UserRole.STUDENT)
        if group_name:
            queryset = queryset.filter(group_name=group_name)
        if search:
            queryset = queryset.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(group_name__icontains=search)
                | Q(username__icontains=search)
            )
        students = (
            queryset.order_by("last_name", "first_name")
            .values("id", "username", "first_name", "last_name", "group_name")[:100]
        )
        return Response(list(students))

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def teachers(self, request):
        search = (request.query_params.get("search") or "").strip()
        queryset = User.objects.filter(role=UserRole.TEACHER)
        if search:
            queryset = queryset.filter(
                Q(first_name__icontains=search) | Q(last_name__icontains=search) | Q(username__icontains=search)
            )
        teachers = (
            queryset.order_by("last_name", "first_name")
            .values("id", "username", "first_name", "last_name", "email")[:100]
        )
        return Response(list(teachers))

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def like(self, request, pk=None):
        project = self.get_object()
        _, created = ProjectLike.objects.get_or_create(project=project, user=request.user)
        return Response({"created": created}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def unlike(self, request, pk=None):
        project = self.get_object()
        ProjectLike.objects.filter(project=project, user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def publish(self, request, pk=None):
        project = self.get_object()
        if request.user.role not in {UserRole.CURATOR, UserRole.ADMIN}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        if project.status != ProjectStatus.DONE:
            return Response(
                {"detail": "Проект можно публиковать только со статусом «Завершен»."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not project.cover_image_url:
            return Response(
                {"detail": "Для публикации требуется обложка проекта."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        project.is_published = True
        project.save(update_fields=["is_published", "updated_at"])
        return Response({"detail": "Проект опубликован."})

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def unpublish(self, request, pk=None):
        project = self.get_object()
        if request.user.role not in {UserRole.CURATOR, UserRole.ADMIN}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        project.is_published = False
        project.save(update_fields=["is_published", "updated_at"])
        return Response({"detail": "Публикация проекта снята."})


    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def archive(self, request, pk=None):
        project = self.get_object()
        if request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        if request.user.role == UserRole.TEACHER and project.supervisor_id != request.user.id:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        project.is_archived = True
        project.save(update_fields=["is_archived", "updated_at"])
        return Response({"detail": "Проект перенесен в архив."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def unarchive(self, request, pk=None):
        project = self.get_object()
        if request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        if request.user.role == UserRole.TEACHER and project.supervisor_id != request.user.id:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        project.is_archived = False
        project.save(update_fields=["is_archived", "updated_at"])
        return Response({"detail": "Проект восстановлен из архива."}, status=status.HTTP_200_OK)

    @action(
        detail=False,
        methods=["post"],
        permission_classes=[permissions.IsAuthenticated],
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_cover(self, request):
        if request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)

        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "Нужно передать файл."}, status=status.HTTP_400_BAD_REQUEST)

        allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
        if uploaded.content_type not in allowed_types:
            return Response({"detail": "Разрешены только изображения (JPG, PNG, WEBP, GIF)."}, status=status.HTTP_400_BAD_REQUEST)

        saved_path = default_storage.save(f"project_covers/{uploaded.name}", uploaded).replace("\\", "/")
        media_url = f"{settings.MEDIA_URL}{saved_path}"
        absolute_url = request.build_absolute_uri(media_url)

        return Response({"cover_image_url": absolute_url}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def portfolio(self, request):
        search = (request.query_params.get("search") or "").strip()
        date_from = parse_date(request.query_params.get("date_from") or "")
        date_to = parse_date(request.query_params.get("date_to") or "")
        limit = int(request.query_params.get("limit") or 20)
        limit = max(1, min(limit, 100))

        done_projects_filter = Q(projects__status=ProjectStatus.DONE)
        done_supervised_filter = Q(supervised_projects__status=ProjectStatus.DONE)
        if date_from:
            done_projects_filter &= Q(projects__end_date__gte=date_from)
            done_supervised_filter &= Q(supervised_projects__end_date__gte=date_from)
        if date_to:
            done_projects_filter &= Q(projects__end_date__lte=date_to)
            done_supervised_filter &= Q(supervised_projects__end_date__lte=date_to)

        student_queryset = User.objects.filter(role=UserRole.STUDENT)
        teacher_queryset = User.objects.filter(role=UserRole.TEACHER)
        if search:
            search_filter = (
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(username__icontains=search)
                | Q(group_name__icontains=search)
            )
            student_queryset = student_queryset.filter(search_filter)
            teacher_queryset = teacher_queryset.filter(search_filter)

        top_students = list(
            student_queryset.annotate(completed_count=Count("projects", filter=done_projects_filter, distinct=True))
            .values("id", "username", "first_name", "last_name", "group_name", "completed_count")
            .order_by("-completed_count", "last_name", "first_name")[:limit]
        )
        top_teachers = list(
            teacher_queryset.annotate(
                completed_count=Count("supervised_projects", filter=done_supervised_filter, distinct=True)
            )
            .values("id", "username", "first_name", "last_name", "completed_count")
            .order_by("-completed_count", "last_name", "first_name")[:limit]
        )

        return Response(
            {
                "date_from": str(date_from) if date_from else None,
                "date_to": str(date_to) if date_to else None,
                "top_students": top_students,
                "top_teachers": top_teachers,
            }
        )

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def methodist_report(self, request):
        if request.user.role not in {UserRole.METHODIST, UserRole.CURATOR, UserRole.ADMIN}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)

        date_from = parse_date(request.query_params.get("date_from") or "")
        date_to = parse_date(request.query_params.get("date_to") or "")
        teacher_search = (request.query_params.get("teacher_search") or "").strip()
        limit = int(request.query_params.get("limit") or 20)
        limit = max(1, min(limit, 200))

        done_filter = Q(status=ProjectStatus.DONE)
        done_supervised_filter = Q(supervised_projects__status=ProjectStatus.DONE)
        if date_from:
            done_filter &= Q(end_date__gte=date_from)
            done_supervised_filter &= Q(supervised_projects__end_date__gte=date_from)
        if date_to:
            done_filter &= Q(end_date__lte=date_to)
            done_supervised_filter &= Q(supervised_projects__end_date__lte=date_to)

        completed_projects = Project.objects.filter(done_filter)
        completed_total = completed_projects.count()

        completed_by_type = list(
            completed_projects.values("type").annotate(total=Count("id")).order_by("-total", "type")
        )
        projects_by_status = list(
            Project.objects.values("status").annotate(total=Count("id")).order_by("-total", "status")
        )

        teacher_queryset = User.objects.filter(role=UserRole.TEACHER)
        if teacher_search:
            teacher_queryset = teacher_queryset.filter(
                Q(first_name__icontains=teacher_search)
                | Q(last_name__icontains=teacher_search)
                | Q(username__icontains=teacher_search)
            )
        teacher_workload = list(
            teacher_queryset.annotate(
                total_projects=Count("supervised_projects", distinct=True),
                completed_projects=Count("supervised_projects", filter=done_supervised_filter, distinct=True),
            )
            .values("id", "username", "first_name", "last_name", "total_projects", "completed_projects")
            .order_by("-total_projects", "-completed_projects", "last_name", "first_name")[:limit]
        )

        student_performance = list(
            User.objects.filter(role=UserRole.STUDENT)
            .annotate(
                completed_projects=Count("projects", filter=Q(projects__status=ProjectStatus.DONE), distinct=True),
            )
            .values("id", "username", "first_name", "last_name", "group_name", "completed_projects")
            .order_by("-completed_projects", "last_name", "first_name")[:limit]
        )

        avg_completed_by_teacher = 0
        if teacher_workload:
            avg_completed_by_teacher = round(
                sum(row["completed_projects"] for row in teacher_workload) / len(teacher_workload), 2
            )

        return Response(
            {
                "date_from": str(date_from) if date_from else None,
                "date_to": str(date_to) if date_to else None,
                "completed_total": completed_total,
                "completed_by_type": completed_by_type,
                "projects_by_status": projects_by_status,
                "teacher_workload": teacher_workload,
                "student_performance": student_performance,
                "avg_completed_by_teacher": avg_completed_by_teacher,
            }
        )

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def teacher_deadlines(self, request):
        user = request.user
        if user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)

        days = int(request.query_params.get("days") or 14)
        days = max(1, min(days, 90))
        date_to = timezone.localdate() + timedelta(days=days)

        stages_qs = (
            ProjectStage.objects.select_related("project")
            .filter(deadline__isnull=False, deadline__lte=date_to, status__in=[StageStatus.OPEN, StageStatus.SUBMITTED])
            .order_by("deadline", "project_id", "order")
        )
        if user.role == UserRole.TEACHER:
            stages_qs = stages_qs.filter(project__supervisor_id=user.id)

        stages = list(
            stages_qs.values(
                "id",
                "title",
                "status",
                "deadline",
                "order",
                "project_id",
                "project__title",
                "project__status",
            )
        )
        return Response({"days": days, "count": len(stages), "items": stages})

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def request_publish(self, request, pk=None):
        project = self.get_object()
        user = request.user
        if user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        if user.role == UserRole.TEACHER and project.supervisor_id != user.id:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        if project.status != ProjectStatus.DONE:
            return Response({"detail": "Проект должен быть в статусе «Завершен»."}, status=status.HTTP_400_BAD_REQUEST)

        recipients = User.objects.filter(role__in=[UserRole.CURATOR, UserRole.ADMIN], is_active=True)
        create_notifications(
            recipients,
            actor=user,
            project=project,
            type=NotificationType.PROJECT_PUBLISH_REQUEST,
            title="Запрос на публикацию проекта",
            message=f"{user.full_name or user.username} просит опубликовать проект «{project.title}».",
        )
        return Response({"detail": "Запрос на публикацию отправлен куратору."}, status=status.HTTP_200_OK)


class ProjectStageViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectStageSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ("project", "status")
    ordering_fields = ("order", "deadline", "updated_at")

    def get_queryset(self):
        return ProjectStage.objects.select_related("project", "updated_by")

    def perform_create(self, serializer):
        project = serializer.validated_data["project"]
        user = self.request.user
        if user.role in {UserRole.CURATOR, UserRole.ADMIN}:
            stage = serializer.save(updated_by=user)
            create_notifications(
                project.participants.all(),
                actor=user,
                project=project,
                stage=stage,
                type=NotificationType.STAGE_CREATED,
                title="Создан новый этап",
                message=f"Этап «{stage.title}» в проекте «{project.title}».",
            )
            return
        if user.role == UserRole.TEACHER and project.supervisor_id == user.id:
            stage = serializer.save(updated_by=user)
            create_notifications(
                project.participants.all(),
                actor=user,
                project=project,
                stage=stage,
                type=NotificationType.STAGE_CREATED,
                title="Создан новый этап",
                message=f"Этап «{stage.title}» в проекте «{project.title}».",
            )
            return
        raise permissions.PermissionDenied("Вы не можете создавать этапы в этом проекте.")

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def update(self, request, *args, **kwargs):
        stage = self.get_object()
        old_status = stage.status
        user = request.user
        # Один маршрут обслуживает три роли с разными правами изменения.
        if user.role in {UserRole.CURATOR, UserRole.ADMIN}:
            response = super().update(request, *args, **kwargs)
            stage.refresh_from_db()
            if stage.status != old_status and stage.status in {StageStatus.APPROVED, StageStatus.CHANGES_REQUESTED}:
                recipients = stage.project.participants.filter(role=UserRole.STUDENT)
                create_notifications(
                    recipients,
                    actor=user,
                    project=stage.project,
                    stage=stage,
                    type=NotificationType.STAGE_REVIEWED,
                    title="Этап проверен",
                    message=f"Этап «{stage.title}»: статус изменен на {stage.status}.",
                )
            return response
        if user.role == UserRole.TEACHER and stage.project.supervisor_id == user.id:
            response = super().update(request, *args, **kwargs)
            stage.refresh_from_db()
            if stage.status != old_status and stage.status in {StageStatus.APPROVED, StageStatus.CHANGES_REQUESTED}:
                recipients = stage.project.participants.filter(role=UserRole.STUDENT)
                create_notifications(
                    recipients,
                    actor=user,
                    project=stage.project,
                    stage=stage,
                    type=NotificationType.STAGE_REVIEWED,
                    title="Этап проверен",
                    message=f"Этап «{stage.title}»: статус изменен на {stage.status}.",
                )
            return response
        if user.role == UserRole.STUDENT and stage.project.participants.filter(id=user.id).exists():
            allowed_fields = {"student_report", "status"}
            if any(field not in allowed_fields for field in request.data.keys()):
                return Response(
                    {"detail": "Студент может изменять только отчет и статус этапа."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            stage_status = request.data.get("status")
            if stage_status and stage_status not in {StageStatus.OPEN, StageStatus.SUBMITTED}:
                return Response(
                    {"detail": "Студент может установить только статусы «Открыт» или «Сдан на проверку»."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            response = super().update(request, *args, **kwargs)
            stage.refresh_from_db()
            if stage.status == StageStatus.SUBMITTED:
                curator_admins = User.objects.filter(role__in=[UserRole.CURATOR, UserRole.ADMIN])
                recipients = list(curator_admins) + [stage.project.supervisor]
                create_notifications(
                    recipients,
                    actor=user,
                    project=stage.project,
                    stage=stage,
                    type=NotificationType.STAGE_SUBMITTED,
                    title="Этап отправлен на проверку",
                    message=f"{user.full_name or user.username} отправил этап «{stage.title}».",
                )
            return response
        return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)

    def destroy(self, request, *args, **kwargs):
        stage = self.get_object()
        user = request.user
        if user.role in {UserRole.CURATOR, UserRole.ADMIN}:
            return super().destroy(request, *args, **kwargs)
        if user.role == UserRole.TEACHER and stage.project.supervisor_id == user.id:
            return super().destroy(request, *args, **kwargs)
        return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)


class ProjectCommentViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ProjectCommentSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ("project", "stage", "is_approved")
    search_fields = ("text", "author__first_name", "author__last_name")
    ordering_fields = ("created_at",)

    def get_queryset(self):
        queryset = ProjectComment.objects.select_related("project", "author", "stage")
        if self.request.user.role in {UserRole.CURATOR, UserRole.ADMIN}:
            return queryset
        return queryset

    def perform_create(self, serializer):
        comment = serializer.save(author=self.request.user, is_approved=True)
        recipients = comment.project.participants.exclude(id=self.request.user.id)
        if comment.project.supervisor_id != self.request.user.id:
            recipients = (recipients | User.objects.filter(id=comment.project.supervisor_id)).distinct()
        recipient_ids = list(recipients.values_list("id", flat=True))
        actor = self.request.user
        project = comment.project
        stage = comment.stage
        message = f"{actor.full_name or actor.username}: {comment.text[:200]}"

        def _worker():
            # Массовая рассылка уведомлений вынесена в фон,
            # чтобы запрос создания комментария отвечал быстро.
            close_old_connections()
            try:
                create_notifications(
                    User.objects.filter(id__in=recipient_ids),
                    actor=actor,
                    project=project,
                    stage=stage,
                    type=NotificationType.COMMENT_PENDING,
                    title="Комментарий опубликован",
                    message=message,
                )
            finally:
                close_old_connections()

        threading.Thread(target=_worker, daemon=True).start()

    @action(detail=True, methods=["post"], permission_classes=[IsCuratorOrReadOnly])
    def approve(self, request, pk=None):
        comment = self.get_object()
        comment.is_approved = True
        comment.save(update_fields=["is_approved"])
        return Response({"detail": "Комментарий подтвержден."})


class ProjectLikeViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = ProjectLikeSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ("project", "user")
    ordering_fields = ("created_at",)

    def get_queryset(self):
        return ProjectLike.objects.select_related("project", "user")


class TeamManageViewSet(viewsets.ModelViewSet):
    serializer_class = TeamManageSerializer
    permission_classes = [permissions.IsAuthenticated]
    search_fields = ("name", "group_name")
    ordering_fields = ("name", "created_at", "members_total")

    def get_queryset(self):
        queryset = (
            Team.objects.exclude(name__startswith="group:")
            .prefetch_related("members")
            .select_related("supervisor")
            .annotate(members_total=Count("members", distinct=True))
        )

        has_photo = (self.request.query_params.get("has_photo") or "").strip().lower()
        members_min = (self.request.query_params.get("members_min") or "").strip()
        members_max = (self.request.query_params.get("members_max") or "").strip()

        if has_photo == "true":
            queryset = queryset.exclude(photo_url="")
        elif has_photo == "false":
            queryset = queryset.filter(photo_url="")

        if members_min.isdigit():
            queryset = queryset.filter(members_total__gte=int(members_min))
        if members_max.isdigit():
            queryset = queryset.filter(members_total__lte=int(members_max))

        if self.request.user.role == UserRole.TEACHER:
            return queryset.filter(supervisor_id=self.request.user.id)
        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        if user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            raise permissions.PermissionDenied("Недостаточно прав.")
        serializer.save(supervisor=user)

    def perform_update(self, serializer):
        user = self.request.user
        team = self.get_object()
        if user.role == UserRole.TEACHER and team.supervisor_id != user.id:
            raise permissions.PermissionDenied("Недостаточно прав.")
        if user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            raise permissions.PermissionDenied("Недостаточно прав.")
        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        if user.role == UserRole.TEACHER and instance.supervisor_id != user.id:
            raise permissions.PermissionDenied("Недостаточно прав.")
        if user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            raise permissions.PermissionDenied("Недостаточно прав.")
        instance.delete()

    @action(
        detail=False,
        methods=["post"],
        permission_classes=[permissions.IsAuthenticated],
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_photo(self, request):
        if request.user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)

        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "Нужно передать файл."}, status=status.HTTP_400_BAD_REQUEST)

        allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
        if uploaded.content_type not in allowed_types:
            return Response({"detail": "Разрешены только изображения (JPG, PNG, WEBP, GIF)."}, status=status.HTTP_400_BAD_REQUEST)

        saved_path = default_storage.save(f"team_photos/{uploaded.name}", uploaded).replace("\\", "/")
        media_url = f"{settings.MEDIA_URL}{saved_path}"
        absolute_url = request.build_absolute_uri(media_url)
        return Response({"photo_url": absolute_url}, status=status.HTTP_201_CREATED)


class ProjectSupervisorInviteViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSupervisorInviteSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "patch", "head", "options"]
    ordering_fields = ("created_at", "status")

    def get_queryset(self):
        queryset = ProjectSupervisorInvite.objects.select_related("project", "student", "teacher")
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(teacher=user)
        if user.role == UserRole.STUDENT:
            return queryset.filter(student=user)
        if user.role in {UserRole.CURATOR, UserRole.ADMIN}:
            return queryset
        return queryset.none()

    def perform_create(self, serializer):
        invite = serializer.save(student=self.request.user)
        create_notifications(
            [invite.teacher],
            actor=self.request.user,
            project=invite.project,
            type=NotificationType.SUPERVISOR_INVITED,
            title="Вас пригласили руководителем проекта",
            message=f"Проект: {invite.project.title}",
        )

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def accept(self, request, pk=None):
        invite = self.get_object()
        if request.user.id != invite.teacher_id:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        if invite.status != SupervisorInviteStatus.PENDING:
            return Response({"detail": "Приглашение уже обработано."}, status=status.HTTP_400_BAD_REQUEST)

        invite.status = SupervisorInviteStatus.ACCEPTED
        invite.responded_at = timezone.now()
        invite.save(update_fields=["status", "responded_at"])

        project = invite.project
        project.supervisor = request.user
        project.save(update_fields=["supervisor", "updated_at"])

        create_notifications(
            [invite.student],
            actor=request.user,
            project=project,
            type=NotificationType.SUPERVISOR_INVITE_ACCEPTED,
            title="Преподаватель принял приглашение",
            message=f"{request.user.full_name or request.user.username} стал руководителем проекта {project.title}",
        )

        return Response({"detail": "Приглашение принято."})

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def decline(self, request, pk=None):
        invite = self.get_object()
        if request.user.id != invite.teacher_id:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        if invite.status != SupervisorInviteStatus.PENDING:
            return Response({"detail": "Приглашение уже обработано."}, status=status.HTTP_400_BAD_REQUEST)

        invite.status = SupervisorInviteStatus.DECLINED
        invite.responded_at = timezone.now()
        invite.save(update_fields=["status", "responded_at"])

        create_notifications(
            [invite.student],
            actor=request.user,
            project=invite.project,
            type=NotificationType.SUPERVISOR_INVITE_DECLINED,
            title="Преподаватель отклонил приглашение",
            message=f"{request.user.full_name or request.user.username} отклонил приглашение в проект {invite.project.title}",
        )
        return Response({"detail": "Приглашение отклонено."})
