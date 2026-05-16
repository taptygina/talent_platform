from django.db import transaction
import re

from django.utils.text import slugify
from django.utils import timezone
from rest_framework import serializers

from apps.file_security import FileValidationError, UploadPolicy, sanitize_filename, validate_uploaded_file
from apps.notifications.models import NotificationType
from apps.notifications.services import create_notifications
from apps.projects.html_sanitizer import sanitize_html
from apps.projects.models import (
    Project,
    ProjectComment,
    ProjectDeadlineChangeLog,
    ProjectLike,
    ProjectStage,
    ProjectStageReview,
    ProjectStageSubmission,
    ProjectStageSubmissionFile,
    ProjectStatus,
    ProjectSupervisorInvite,
    ProjectTemplate,
    ProjectTemplateSection,
    StageDeadlineChangeLog,
    StageMaterial,
    StageReviewDecision,
    StageStatus,
    StageSubmissionStatus,
    SupervisorInviteStatus,
    Team,
    TeamKind,
    TeamMember,
)
from apps.users.models import SystemSetting, User, UserRole
from apps.users.serializers import UserSerializer

MAX_TEMPLATE_FILE_SIZE = 8 * 1024 * 1024
MAX_STAGE_FILE_SIZE = 20 * 1024 * 1024
SECTION_NUMBER_RE = re.compile(r"^\s*(\d+(?:\.\d+)*)\s+")


def _max_team_members_limit() -> int:
    settings_obj = SystemSetting.objects.order_by("id").first()
    return settings_obj.max_team_members if settings_obj else 20


class TeamSerializer(serializers.ModelSerializer):
    members = UserSerializer(many=True, read_only=True)
    members_count = serializers.IntegerField(source="members.count", read_only=True)

    class Meta:
        model = Team
        fields = ("id", "name", "kind", "group_name", "photo_url", "supervisor", "members_count", "members", "created_at")


class TeamManageSerializer(serializers.ModelSerializer):
    members = UserSerializer(many=True, read_only=True)
    member_ids = serializers.PrimaryKeyRelatedField(
        source="members",
        many=True,
        queryset=User.objects.filter(role=UserRole.STUDENT),
        write_only=True,
        required=False,
    )
    members_count = serializers.IntegerField(source="members.count", read_only=True)

    class Meta:
        model = Team
        fields = (
            "id",
            "name",
            "kind",
            "group_name",
            "photo_url",
            "supervisor",
            "members_count",
            "members",
            "member_ids",
            "created_at",
        )

    def validate_name(self, value):
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("Название команды не может быть пустым.")

        queryset = Team.objects.filter(name__iexact=name)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Команда с таким названием уже существует.")
        return name

    def create(self, validated_data):
        members = validated_data.pop("members", [])
        team = Team.objects.create(**validated_data)
        if members:
            team.members.set(members)
            request = self.context.get("request")
            actor = request.user if request and request.user.is_authenticated else None
            create_notifications(
                members,
                actor=actor,
                type=NotificationType.TEAM_INVITED,
                title="Вас пригласили в команду",
                message=f"Команда: {team.name}",
            )
        return team

    def update(self, instance, validated_data):
        previous_member_ids = set(instance.members.values_list("id", flat=True))
        members = validated_data.pop("members", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if members is not None:
            instance.members.set(members)
            added_members = [member for member in members if member.id not in previous_member_ids]
            if added_members:
                request = self.context.get("request")
                actor = request.user if request and request.user.is_authenticated else None
                create_notifications(
                    added_members,
                    actor=actor,
                    type=NotificationType.TEAM_INVITED,
                    title="Вас пригласили в команду",
                    message=f"Команда: {instance.name}",
                )
        return instance


class ProjectTemplateSectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectTemplateSection
        fields = ("id", "template", "title", "code", "order", "default_task")
        extra_kwargs = {
            "code": {"required": False, "allow_blank": True},
        }
        validators = []

    @staticmethod
    def _generate_unique_code(template: ProjectTemplate, raw_value: str) -> str:
        base = slugify(raw_value or "")[:120]
        if not base:
            base = "section"
        candidate = base
        suffix = 2
        while ProjectTemplateSection.objects.filter(template=template, code=candidate).exists():
            suffix_str = f"-{suffix}"
            candidate = f"{base[:120 - len(suffix_str)]}{suffix_str}"
            suffix += 1
        return candidate

    @staticmethod
    def _section_sort_key(section: ProjectTemplateSection, index: int):
        title = section.title or ""
        normalized = title.strip().casefold()
        if normalized == "введение":
            return (0, [], section.order, index)
        match = SECTION_NUMBER_RE.match(title)
        if match:
            numbers = [int(part) for part in match.group(1).split(".")]
            return (1, numbers, section.order, index)
        if normalized == "заключение" or "список" in normalized:
            return (3, [], section.order, index)
        return (2, [], section.order, index)

    @classmethod
    def _renumber_sections(cls, template: ProjectTemplate) -> None:
        sections = list(template.sections.order_by("order", "id"))
        ordered = sorted(sections, key=lambda section: cls._section_sort_key(section, sections.index(section)))
        for offset, section in enumerate(ordered, start=1):
            if section.order != offset:
                section.order = 100000 + offset
                section.save(update_fields=["order"])
        for offset, section in enumerate(ordered, start=1):
            if section.order != offset:
                section.order = offset
                section.save(update_fields=["order"])

    def create(self, validated_data):
        template = validated_data["template"]
        raw_code = (validated_data.get("code") or "").strip()
        if not raw_code:
            raw_code = validated_data.get("title", "")
        validated_data["code"] = self._generate_unique_code(template, raw_code)
        section = super().create(validated_data)
        self._renumber_sections(template)
        section.refresh_from_db()
        return section

    def update(self, instance, validated_data):
        section = super().update(instance, validated_data)
        self._renumber_sections(section.template)
        section.refresh_from_db()
        return section

    def validate_default_task(self, value):
        return sanitize_html(value or "")


class ProjectTemplateSerializer(serializers.ModelSerializer):
    sections = ProjectTemplateSectionSerializer(many=True, read_only=True)

    class Meta:
        model = ProjectTemplate
        fields = (
            "id",
            "name",
            "project_type",
            "description",
            "template_file",
            "format_profile",
            "builder_schema",
            "is_active",
            "created_by",
            "sections",
            "created_at",
        )
        read_only_fields = ("created_by", "created_at", "format_profile")

    def validate(self, attrs):
        return attrs

    def validate_template_file(self, uploaded):
        if not uploaded:
            return uploaded
        try:
            validate_uploaded_file(
                uploaded,
                policy=UploadPolicy(
                    allowed_extensions={".docx"},
                    max_size_bytes=MAX_TEMPLATE_FILE_SIZE,
                    allow_office=True,
                ),
            )
        except FileValidationError as exc:
            raise serializers.ValidationError(str(exc))
        uploaded.name = sanitize_filename(uploaded.name, default_stem="project-template")
        return uploaded

    def validate_builder_schema(self, value):
        from apps.projects.template_utils import normalize_builder_schema

        return normalize_builder_schema(value)


class ProjectListSerializer(serializers.ModelSerializer):
    supervisor_name = serializers.CharField(source="supervisor.full_name", read_only=True)
    participants_count = serializers.IntegerField(read_only=True)
    likes_count = serializers.IntegerField(read_only=True)
    comments_count = serializers.IntegerField(read_only=True)
    liked_by_me = serializers.BooleanField(read_only=True)
    team_name = serializers.CharField(source="team.name", read_only=True)

    class Meta:
        model = Project
        fields = (
            "id",
            "title",
            "type",
            "status",
            "cover_image_url",
            "start_date",
            "end_date",
            "is_published",
            "is_archived",
            "supervisor_name",
            "academic_group_name",
            "team_name",
            "participants_count",
            "likes_count",
            "comments_count",
            "liked_by_me",
            "created_at",
        )


class ProjectDeadlineChangeLogSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.full_name", read_only=True)

    class Meta:
        model = ProjectDeadlineChangeLog
        fields = (
            "id",
            "old_start_date",
            "new_start_date",
            "old_end_date",
            "new_end_date",
            "reason",
            "changed_by",
            "changed_by_name",
            "changed_at",
        )


class StageDeadlineChangeLogSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.full_name", read_only=True)

    class Meta:
        model = StageDeadlineChangeLog
        fields = ("id", "old_deadline", "new_deadline", "reason", "changed_by", "changed_by_name", "changed_at")


class StageMaterialSerializer(serializers.ModelSerializer):
    def validate_file(self, uploaded):
        try:
            validate_uploaded_file(
                uploaded,
                policy=UploadPolicy(
                    allowed_extensions={".pdf", ".docx", ".xlsx", ".pptx", ".zip", ".txt", ".md", ".csv", ".json"},
                    max_size_bytes=MAX_STAGE_FILE_SIZE,
                    allow_office=True,
                    allow_pdf=True,
                    allow_text=True,
                    allow_zip=True,
                ),
            )
        except FileValidationError as exc:
            raise serializers.ValidationError(str(exc))
        uploaded.name = sanitize_filename(uploaded.name, default_stem="stage-material")
        return uploaded

    class Meta:
        model = StageMaterial
        fields = ("id", "stage", "file", "uploaded_by", "description", "created_at")
        read_only_fields = ("uploaded_by", "created_at")


class ProjectStageSubmissionFileSerializer(serializers.ModelSerializer):
    def validate_file(self, uploaded):
        try:
            validate_uploaded_file(
                uploaded,
                policy=UploadPolicy(
                    allowed_extensions={".pdf", ".docx", ".xlsx", ".pptx", ".zip", ".txt", ".md", ".csv", ".json"},
                    max_size_bytes=MAX_STAGE_FILE_SIZE,
                    allow_office=True,
                    allow_pdf=True,
                    allow_text=True,
                    allow_zip=True,
                ),
            )
        except FileValidationError as exc:
            raise serializers.ValidationError(str(exc))
        uploaded.name = sanitize_filename(uploaded.name, default_stem="stage-submission")
        return uploaded

    class Meta:
        model = ProjectStageSubmissionFile
        fields = ("id", "submission", "file", "uploaded_at")
        read_only_fields = ("uploaded_at",)


class ProjectStageSubmissionSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_id = serializers.PrimaryKeyRelatedField(
        source="student",
        queryset=User.objects.filter(role=UserRole.STUDENT),
        write_only=True,
        required=False,
    )
    files = ProjectStageSubmissionFileSerializer(many=True, read_only=True)
    status = serializers.ChoiceField(choices=StageSubmissionStatus.choices, required=False)

    class Meta:
        model = ProjectStageSubmission
        fields = (
            "id",
            "stage",
            "student",
            "student_id",
            "student_name",
            "submission_text",
            "status",
            "submitted_at",
            "checked_at",
            "updated_at",
            "files",
        )
        read_only_fields = ("student", "submitted_at", "checked_at", "updated_at")
        validators = []

    def validate(self, attrs):
        request = self.context.get("request")
        student = attrs.get("student")
        stage = attrs.get("stage")

        if not student and request and request.user.is_authenticated and request.user.role == UserRole.STUDENT:
            student = request.user
            attrs["student"] = student

        if self.instance is None and stage and student:
            if ProjectStageSubmission.objects.filter(stage=stage, student=student).exists():
                raise serializers.ValidationError({"detail": "Сдача по этому этапу уже создана."})

        if "submission_text" in attrs:
            attrs["submission_text"] = sanitize_html(attrs.get("submission_text") or "")

        return attrs


class ProjectStageReviewSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True)
    decision = serializers.ChoiceField(choices=StageReviewDecision.choices)
    score = serializers.IntegerField(required=False, allow_null=True, min_value=0, max_value=100)

    class Meta:
        model = ProjectStageReview
        fields = ("id", "submission", "teacher", "teacher_name", "decision", "score", "comment", "created_at")
        read_only_fields = ("teacher", "created_at")

    def validate_comment(self, value):
        return sanitize_html(value or "")


class ProjectStageSerializer(serializers.ModelSerializer):
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all())
    deadline_change_reason = serializers.CharField(write_only=True, required=False, allow_blank=True)
    deadline_changes = StageDeadlineChangeLogSerializer(many=True, read_only=True)
    materials = StageMaterialSerializer(many=True, read_only=True)
    submissions = ProjectStageSubmissionSerializer(many=True, read_only=True)

    class Meta:
        model = ProjectStage
        fields = (
            "id",
            "project",
            "template_section",
            "title",
            "description",
            "order",
            "deadline",
            "deadline_change_reason",
            "deadline_changes",
            "task_text",
            "status",
            "student_report",
            "teacher_feedback",
            "updated_by",
            "updated_at",
            "materials",
            "submissions",
        )
        read_only_fields = ("updated_by", "updated_at")

    def create(self, validated_data):
        if "task_text" in validated_data:
            validated_data["task_text"] = sanitize_html(validated_data.get("task_text") or "")
        if "student_report" in validated_data:
            validated_data["student_report"] = sanitize_html(validated_data.get("student_report") or "")
        if "teacher_feedback" in validated_data:
            validated_data["teacher_feedback"] = sanitize_html(validated_data.get("teacher_feedback") or "")
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "task_text" in validated_data:
            validated_data["task_text"] = sanitize_html(validated_data.get("task_text") or "")
        if "student_report" in validated_data:
            validated_data["student_report"] = sanitize_html(validated_data.get("student_report") or "")
        if "teacher_feedback" in validated_data:
            validated_data["teacher_feedback"] = sanitize_html(validated_data.get("teacher_feedback") or "")

        reason = (validated_data.pop("deadline_change_reason", "") or "").strip()
        old_deadline = instance.deadline
        new_deadline = validated_data.get("deadline", instance.deadline)
        deadline_changed = old_deadline != new_deadline
        if deadline_changed and not reason:
            reason = "Изменение срока этапа."

        stage = super().update(instance, validated_data)
        if deadline_changed:
            request = self.context.get("request")
            StageDeadlineChangeLog.objects.create(
                stage=stage,
                old_deadline=old_deadline,
                new_deadline=new_deadline,
                reason=reason,
                changed_by=request.user if request and request.user.is_authenticated else None,
            )
        return stage


class ProjectDetailSerializer(serializers.ModelSerializer):
    supervisor = UserSerializer(read_only=True)
    supervisor_id = serializers.PrimaryKeyRelatedField(source="supervisor", queryset=User.objects.all(), write_only=True)
    participants = UserSerializer(many=True, read_only=True)
    participant_ids = serializers.PrimaryKeyRelatedField(
        source="participants",
        many=True,
        queryset=User.objects.all(),
        write_only=True,
        required=False,
    )
    team = TeamSerializer(read_only=True)
    team_id = serializers.PrimaryKeyRelatedField(source="team", queryset=Team.objects.all(), write_only=True, required=False)
    template = ProjectTemplateSerializer(read_only=True)
    template_id = serializers.PrimaryKeyRelatedField(
        source="template",
        queryset=ProjectTemplate.objects.filter(is_active=True),
        write_only=True,
        required=False,
        allow_null=True,
    )
    auto_generate_stages = serializers.BooleanField(write_only=True, required=False, default=False)

    group_name = serializers.CharField(write_only=True, required=False)
    group_student_ids = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        many=True,
        write_only=True,
        required=False,
    )
    new_team_name = serializers.CharField(write_only=True, required=False)
    new_team_member_ids = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        many=True,
        write_only=True,
        required=False,
    )
    deadline_change_reason = serializers.CharField(write_only=True, required=False, allow_blank=True)
    deadline_changes = ProjectDeadlineChangeLogSerializer(many=True, read_only=True)

    stages = ProjectStageSerializer(many=True, read_only=True)
    likes_count = serializers.IntegerField(read_only=True)
    comments_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Project
        fields = (
            "id",
            "title",
            "description",
            "goal",
            "type",
            "status",
            "start_date",
            "end_date",
            "deadline_change_reason",
            "deadline_changes",
            "cover_image_url",
            "is_published",
            "is_archived",
            "supervisor",
            "supervisor_id",
            "academic_group_name",
            "team",
            "team_id",
            "template",
            "template_id",
            "auto_generate_stages",
            "auto_generated_stages",
            "group_name",
            "group_student_ids",
            "new_team_name",
            "new_team_member_ids",
            "participants",
            "participant_ids",
            "stages",
            "likes_count",
            "comments_count",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        selected_modes = 0
        has_group = bool(attrs.get("group_name"))
        has_team = bool(attrs.get("team"))
        has_new_team = bool(attrs.get("new_team_name") or attrs.get("new_team_member_ids"))

        selected_modes += 1 if has_group else 0
        selected_modes += 1 if has_team else 0
        selected_modes += 1 if has_new_team else 0

        if selected_modes > 1:
            raise serializers.ValidationError(
                "Используйте только один источник участников: group_name или team_id или new_team_name/new_team_member_ids."
            )

        new_members = attrs.get("new_team_member_ids", [])
        if has_new_team:
            if not attrs.get("new_team_name"):
                raise serializers.ValidationError("Для создания команды укажите new_team_name.")
            if not new_members:
                raise serializers.ValidationError("Для создания команды укажите new_team_member_ids.")
            max_members = _max_team_members_limit()
            if len(new_members) > max_members:
                raise serializers.ValidationError(f"В новой команде может быть не более {max_members} участников.")

        if has_group:
            group_name = attrs["group_name"]
            group_students = User.objects.filter(role=UserRole.STUDENT, group_name=group_name)
            if not group_students.exists():
                raise serializers.ValidationError(f"В группе '{group_name}' нет студентов.")
            selected_group_students = attrs.get("group_student_ids", [])
            if selected_group_students:
                invalid = [
                    student.id
                    for student in selected_group_students
                    if student.role != UserRole.STUDENT or student.group_name != group_name
                ]
                if invalid:
                    raise serializers.ValidationError(f"Студенты {invalid} не относятся к группе '{group_name}'.")

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        manual_participants = validated_data.pop("participants", None)
        validated_data.pop("deadline_change_reason", None)
        auto_generate_stages = bool(validated_data.pop("auto_generate_stages", False))
        group_name = validated_data.pop("group_name", None)
        group_student_ids = validated_data.pop("group_student_ids", [])
        new_team_name = validated_data.pop("new_team_name", None)
        new_team_members = validated_data.pop("new_team_member_ids", [])
        selected_team = validated_data.pop("team", None)

        project = Project.objects.create(**validated_data)
        participants = None

        if group_name:
            participants = list(group_student_ids) if group_student_ids else list(
                User.objects.filter(role=UserRole.STUDENT, group_name=group_name)
            )
            project.team = None
            project.academic_group_name = group_name
            project.save(update_fields=["team", "academic_group_name"])
        elif selected_team:
            participants = list(selected_team.members.all())
            project.team = selected_team
            project.academic_group_name = ""
            project.save(update_fields=["team", "academic_group_name"])
        elif new_team_name:
            team = Team.objects.create(
                name=new_team_name,
                kind=TeamKind.CREATIVE,
                supervisor=project.supervisor,
            )
            TeamMember.objects.bulk_create([TeamMember(team=team, user=user) for user in new_team_members])
            participants = list(new_team_members)
            project.team = team
            project.academic_group_name = ""
            project.save(update_fields=["team", "academic_group_name"])
        elif manual_participants is not None:
            participants = list(manual_participants)
            project.team = None
            project.academic_group_name = ""
            project.save(update_fields=["team", "academic_group_name"])

        if participants is not None:
            project.participants.set(participants)
            create_notifications(
                participants,
                actor=self.context["request"].user if self.context.get("request") else None,
                project=project,
                type=NotificationType.PROJECT_ASSIGNED,
                title="Вас добавили в проект",
                message=f"Проект: {project.title}",
            )

        if auto_generate_stages and project.template_id:
            sections = project.template.sections.order_by("order", "id")
            for section in sections:
                ProjectStage.objects.create(
                    project=project,
                    template_section=section,
                    title=section.title,
                    description="",
                    task_text=section.default_task or "",
                    order=section.order,
                    status=StageStatus.OPEN,
                )
            project.auto_generated_stages = True
            project.save(update_fields=["auto_generated_stages", "updated_at"])

        return project

    @transaction.atomic
    def update(self, instance, validated_data):
        manual_participants = validated_data.pop("participants", None)
        group_name = validated_data.pop("group_name", None)
        group_student_ids = validated_data.pop("group_student_ids", [])
        new_team_name = validated_data.pop("new_team_name", None)
        new_team_members = validated_data.pop("new_team_member_ids", [])
        selected_team = validated_data.pop("team", None)
        validated_data.pop("auto_generate_stages", None)
        reason = (validated_data.pop("deadline_change_reason", "") or "").strip()

        old_start_date = instance.start_date
        old_end_date = instance.end_date
        new_start_date = validated_data.get("start_date", instance.start_date)
        new_end_date = validated_data.get("end_date", instance.end_date)
        deadline_changed = old_start_date != new_start_date or old_end_date != new_end_date
        if deadline_changed and not reason:
            reason = "Изменение сроков проекта."

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        if deadline_changed:
            request = self.context.get("request")
            ProjectDeadlineChangeLog.objects.create(
                project=instance,
                old_start_date=old_start_date,
                new_start_date=new_start_date,
                old_end_date=old_end_date,
                new_end_date=new_end_date,
                reason=reason,
                changed_by=request.user if request and request.user.is_authenticated else None,
            )

        if group_name:
            participants = list(group_student_ids) if group_student_ids else list(
                User.objects.filter(role=UserRole.STUDENT, group_name=group_name)
            )
            instance.team = None
            instance.academic_group_name = group_name
            instance.participants.set(participants)
            instance.save(update_fields=["team", "academic_group_name"])
        elif selected_team:
            instance.team = selected_team
            instance.academic_group_name = ""
            instance.participants.set(selected_team.members.all())
            instance.save(update_fields=["team", "academic_group_name"])
        elif new_team_name:
            team = Team.objects.create(
                name=new_team_name,
                kind=TeamKind.CREATIVE,
                supervisor=instance.supervisor,
            )
            TeamMember.objects.bulk_create([TeamMember(team=team, user=user) for user in new_team_members])
            instance.team = team
            instance.academic_group_name = ""
            instance.participants.set(new_team_members)
            instance.save(update_fields=["team", "academic_group_name"])
        elif manual_participants is not None:
            instance.team = None
            instance.academic_group_name = ""
            instance.participants.set(manual_participants)
            instance.save(update_fields=["team", "academic_group_name"])

        return instance


class ProjectCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True)

    class Meta:
        model = ProjectComment
        fields = ("id", "project", "stage", "author", "author_name", "text", "is_approved", "created_at")
        read_only_fields = ("author", "is_approved")

    def validate(self, attrs):
        project = attrs.get("project") or getattr(self.instance, "project", None)
        stage = attrs.get("stage") if "stage" in attrs else getattr(self.instance, "stage", None)
        if stage is not None and project is not None and stage.project_id != project.id:
            raise serializers.ValidationError("Этап комментария должен принадлежать выбранному проекту.")
        if "text" in attrs:
            attrs["text"] = sanitize_html(attrs.get("text") or "")
        return attrs


class ProjectLikeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectLike
        fields = ("id", "project", "user", "created_at")
        read_only_fields = ("user",)


class ProjectSupervisorInviteSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True)
    project_title = serializers.CharField(source="project.title", read_only=True)

    class Meta:
        model = ProjectSupervisorInvite
        fields = (
            "id",
            "project",
            "project_title",
            "student",
            "student_name",
            "teacher",
            "teacher_name",
            "message",
            "status",
            "created_at",
            "responded_at",
        )
        read_only_fields = ("student", "status", "created_at", "responded_at")

    def validate(self, attrs):
        request = self.context.get("request")
        student = request.user if request else None
        project = attrs.get("project")
        teacher = attrs.get("teacher")

        if not student or student.role != UserRole.STUDENT:
            raise serializers.ValidationError("Только студент может отправить приглашение руководителю.")
        if teacher.role != UserRole.TEACHER:
            raise serializers.ValidationError("Приглашать можно только преподавателя.")
        if not project.participants.filter(id=student.id).exists():
            raise serializers.ValidationError("Студент должен быть участником проекта.")
        if ProjectSupervisorInvite.objects.filter(
            project=project,
            student=student,
            teacher=teacher,
            status=SupervisorInviteStatus.PENDING,
        ).exists():
            raise serializers.ValidationError("Приглашение этому преподавателю уже отправлено и ожидает ответа.")

        return attrs


class SubmissionStateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=StageSubmissionStatus.choices)

    def update(self, instance, validated_data):
        status_value = validated_data["status"]
        instance.status = status_value
        if status_value == StageSubmissionStatus.SUBMITTED:
            instance.submitted_at = timezone.now()
        instance.save(update_fields=["status", "submitted_at", "updated_at"])
        return instance

    def create(self, validated_data):
        raise NotImplementedError



