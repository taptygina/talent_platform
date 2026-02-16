from django.conf import settings
from django.db import models


class ProjectType(models.TextChoices):
    CONTEST = "contest", "Contest"
    OLYMPIAD = "olympiad", "Olympiad"
    COURSEWORK = "coursework", "Coursework"
    DIPLOMA = "diploma", "Diploma"
    OTHER = "other", "Other"


class ProjectStatus(models.TextChoices):
    PLANNED = "planned", "Planned"
    IN_PROGRESS = "in_progress", "In progress"
    REVIEW = "review", "In review"
    DONE = "done", "Done"
    CANCELLED = "cancelled", "Cancelled"


class TeamKind(models.TextChoices):
    ACADEMIC = "academic", "Academic group"
    CREATIVE = "creative", "Creative team"


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
    cover_image_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.title


class StageStatus(models.TextChoices):
    OPEN = "open", "Open"
    SUBMITTED = "submitted", "Submitted"
    CHANGES_REQUESTED = "changes_requested", "Changes requested"
    APPROVED = "approved", "Approved"


class ProjectStage(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="stages")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=1)
    deadline = models.DateField(null=True, blank=True)
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


class ProjectComment(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="project_comments")
    text = models.TextField()
    is_approved = models.BooleanField(default=False)
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
    PENDING = "pending", "Pending"
    ACCEPTED = "accepted", "Accepted"
    DECLINED = "declined", "Declined"


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
