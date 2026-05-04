from django.conf import settings
from django.db import models

"""Основные доменные модели проектного модуля.

В этом модуле собраны сущности учебного процесса
(проекты, этапы, сдачи) и сопутствующие сущности
(шаблоны, комментарии, приглашения).
"""


class ProjectType(models.TextChoices):
    CONTEST = "contest", "Конкурс"
    OLYMPIAD = "olympiad", "Олимпиада"
    COURSEWORK = "coursework", "Курсовой проект"
    DIPLOMA = "diploma", "Дипломный проект"
    OTHER = "other", "Другое"


class ProjectStatus(models.TextChoices):
    PLANNED = "planned", "Запланирован"
    IN_PROGRESS = "in_progress", "В работе"
    REVIEW = "review", "На проверке"
    DONE = "done", "Завершен"
    CANCELLED = "cancelled", "Отменен"


class TeamKind(models.TextChoices):
    ACADEMIC = "academic", "Академическая группа"
    CREATIVE = "creative", "Команда"


class Team(models.Model):
    name = models.CharField(max_length=255, unique=True)
    kind = models.CharField(max_length=20, choices=TeamKind.choices, default=TeamKind.CREATIVE)
    group_name = models.CharField(max_length=100, blank=True)
    photo_url = models.URLField(blank=True)
    supervisor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="teams",
    )
    # Отдельная промежуточная модель связи оставляет пространство для истории и метаданных участия.
    members = models.ManyToManyField(settings.AUTH_USER_MODEL, through="TeamMember", related_name="member_teams")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name


class TeamMember(models.Model):
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="team_members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="team_memberships")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["team", "user"], name="unique_team_member"),
        ]


class Project(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    goal = models.TextField(blank=True)
    type = models.CharField(max_length=20, choices=ProjectType.choices, default=ProjectType.OTHER)
    status = models.CharField(max_length=20, choices=ProjectStatus.choices, default=ProjectStatus.PLANNED)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    supervisor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="supervised_projects",
    )
    academic_group_name = models.CharField(max_length=100, blank=True)
    team = models.ForeignKey(Team, null=True, blank=True, on_delete=models.SET_NULL, related_name="projects")
    participants = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="projects", blank=True)
    is_published = models.BooleanField(default=False)
    is_archived = models.BooleanField(default=False)
    cover_image_url = models.URLField(blank=True)
    # Профиль форматирования из шаблона используется для стабильной генерации итогового документа.
    template = models.ForeignKey(
        "ProjectTemplate",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="projects",
    )
    auto_generated_stages = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.title


class StageStatus(models.TextChoices):
    OPEN = "open", "Открыт"
    SUBMITTED = "submitted", "Сдан на проверку"
    CHANGES_REQUESTED = "changes_requested", "Нужны доработки"
    APPROVED = "approved", "Принят"


class ProjectStage(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="stages")
    template_section = models.ForeignKey(
        "ProjectTemplateSection",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="stages",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=1)
    deadline = models.DateField(null=True, blank=True)
    task_text = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=StageStatus.choices, default=StageStatus.OPEN)
    student_report = models.TextField(blank=True)
    teacher_feedback = models.TextField(blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="stage_updates",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("order", "id")
        unique_together = ("project", "order")

    def __str__(self) -> str:
        return f"{self.project_id}:{self.order}:{self.title}"


class ProjectTemplate(models.Model):
    name = models.CharField(max_length=255, unique=True)
    project_type = models.CharField(max_length=20, choices=ProjectType.choices, default=ProjectType.OTHER)
    description = models.TextField(blank=True)
    template_file = models.FileField(upload_to="project_templates/", null=True, blank=True)
    format_profile = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_project_templates",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name


class ProjectTemplateSection(models.Model):
    template = models.ForeignKey(ProjectTemplate, on_delete=models.CASCADE, related_name="sections")
    title = models.CharField(max_length=255)
    code = models.SlugField(max_length=120)
    order = models.PositiveIntegerField(default=1)
    default_task = models.TextField(blank=True)

    class Meta:
        ordering = ("order", "id")
        constraints = [
            models.UniqueConstraint(fields=["template", "code"], name="unique_template_section_code"),
            models.UniqueConstraint(fields=["template", "order"], name="unique_template_section_order"),
        ]

    def __str__(self) -> str:
        return f"{self.template_id}:{self.order}:{self.title}"


class StageMaterial(models.Model):
    stage = models.ForeignKey(ProjectStage, on_delete=models.CASCADE, related_name="materials")
    file = models.FileField(upload_to="stage_materials/")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="uploaded_stage_materials",
    )
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class StageSubmissionStatus(models.TextChoices):
    DRAFT = "draft", "Черновик"
    SUBMITTED = "submitted", "На проверке"
    NEEDS_CHANGES = "needs_changes", "Нужны доработки"
    APPROVED = "approved", "Принято"


class ProjectStageSubmission(models.Model):
    stage = models.ForeignKey(ProjectStage, on_delete=models.CASCADE, related_name="submissions")
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="stage_submissions",
    )
    submission_text = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=StageSubmissionStatus.choices, default=StageSubmissionStatus.DRAFT)
    submitted_at = models.DateTimeField(null=True, blank=True)
    checked_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)
        constraints = [
            models.UniqueConstraint(fields=["stage", "student"], name="unique_stage_submission_per_student"),
        ]


class ProjectStageSubmissionFile(models.Model):
    submission = models.ForeignKey(ProjectStageSubmission, on_delete=models.CASCADE, related_name="files")
    file = models.FileField(upload_to="stage_submissions/")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-uploaded_at",)


class StageReviewDecision(models.TextChoices):
    NEEDS_CHANGES = "needs_changes", "Нужны доработки"
    APPROVED = "approved", "Принято"


class ProjectStageReview(models.Model):
    submission = models.ForeignKey(ProjectStageSubmission, on_delete=models.CASCADE, related_name="reviews")
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="stage_reviews",
    )
    decision = models.CharField(max_length=20, choices=StageReviewDecision.choices)
    score = models.PositiveIntegerField(null=True, blank=True)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class ProjectDeadlineChangeLog(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="deadline_changes")
    old_start_date = models.DateField(null=True, blank=True)
    new_start_date = models.DateField(null=True, blank=True)
    old_end_date = models.DateField(null=True, blank=True)
    new_end_date = models.DateField(null=True, blank=True)
    reason = models.TextField()
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="project_deadline_changes",
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-changed_at",)


class StageDeadlineChangeLog(models.Model):
    stage = models.ForeignKey(ProjectStage, on_delete=models.CASCADE, related_name="deadline_changes")
    old_deadline = models.DateField(null=True, blank=True)
    new_deadline = models.DateField(null=True, blank=True)
    reason = models.TextField()
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stage_deadline_changes",
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-changed_at",)


class ProjectComment(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="comments")
    # Поле этапа опционально: общий комментарий по проекту хранится без привязки к этапу.
    stage = models.ForeignKey(
        ProjectStage,
        on_delete=models.CASCADE,
        related_name="comments",
        null=True,
        blank=True,
    )
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="project_comments")
    text = models.TextField()
    is_approved = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class ProjectLike(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="likes")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="liked_projects")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["project", "user"], name="unique_project_like"),
        ]


class SupervisorInviteStatus(models.TextChoices):
    PENDING = "pending", "Ожидает ответа"
    ACCEPTED = "accepted", "Принято"
    DECLINED = "declined", "Отклонено"


class ProjectSupervisorInvite(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="supervisor_invites")
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_supervisor_invites",
    )
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="received_supervisor_invites",
    )
    message = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=SupervisorInviteStatus.choices, default=SupervisorInviteStatus.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["project", "student", "teacher", "status"],
                condition=models.Q(status="pending"),
                name="unique_pending_supervisor_invite",
            ),
        ]
