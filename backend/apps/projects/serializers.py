from django.db import transaction
from rest_framework import serializers

from apps.notifications.models import NotificationType
from apps.notifications.services import create_notifications
from apps.projects.models import (
    Project,
    ProjectComment,
    ProjectLike,
    ProjectStage,
    ProjectSupervisorInvite,
    SupervisorInviteStatus,
    Team,
    TeamKind,
    TeamMember,
)
from apps.users.models import User, UserRole
from apps.users.serializers import UserSerializer


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
            "supervisor_name",
            "academic_group_name",
            "team_name",
            "participants_count",
            "likes_count",
            "comments_count",
            "liked_by_me",
            "created_at",
        )


class ProjectStageSerializer(serializers.ModelSerializer):
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all())

    class Meta:
        model = ProjectStage
        fields = (
            "id",
            "project",
            "title",
            "description",
            "order",
            "deadline",
            "status",
            "student_report",
            "teacher_feedback",
            "updated_by",
            "updated_at",
        )
        read_only_fields = ("updated_by", "updated_at")


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
            "cover_image_url",
            "is_published",
            "supervisor",
            "supervisor_id",
            "academic_group_name",
            "team",
            "team_id",
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
                "Use only one participant source: group_name OR team_id OR new_team_name/new_team_member_ids."
            )

        new_members = attrs.get("new_team_member_ids", [])
        if has_new_team:
            if not attrs.get("new_team_name"):
                raise serializers.ValidationError("new_team_name is required for new team creation.")
            if not new_members:
                raise serializers.ValidationError("new_team_member_ids is required for new team creation.")
            if len(new_members) > 20:
                raise serializers.ValidationError("New team cannot contain more than 20 members.")

        if has_group:
            group_name = attrs["group_name"]
            group_students = User.objects.filter(role=UserRole.STUDENT, group_name=group_name)
            if not group_students.exists():
                raise serializers.ValidationError(f"No students found for group '{group_name}'.")
            selected_group_students = attrs.get("group_student_ids", [])
            if selected_group_students:
                invalid = [
                    student.id
                    for student in selected_group_students
                    if student.role != UserRole.STUDENT or student.group_name != group_name
                ]
                if invalid:
                    raise serializers.ValidationError(
                        f"Students {invalid} are not from group '{group_name}'."
                    )

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        manual_participants = validated_data.pop("participants", None)
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
                title="You were added to a project",
                message=f"Project: {project.title}",
            )

        return project

    @transaction.atomic
    def update(self, instance, validated_data):
        manual_participants = validated_data.pop("participants", None)
        group_name = validated_data.pop("group_name", None)
        group_student_ids = validated_data.pop("group_student_ids", [])
        new_team_name = validated_data.pop("new_team_name", None)
        new_team_members = validated_data.pop("new_team_member_ids", [])
        selected_team = validated_data.pop("team", None)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

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
        fields = ("id", "project", "author", "author_name", "text", "is_approved", "created_at")
        read_only_fields = ("author", "is_approved")


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
