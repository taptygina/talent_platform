from datetime import timedelta

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.notifications.models import Notification, NotificationType
from apps.projects.models import (
    Project,
    ProjectComment,
    ProjectDeadlineChangeLog,
    ProjectLike,
    ProjectStageReview,
    ProjectStageSubmission,
    ProjectStageSubmissionFile,
    ProjectStage,
    ProjectStatus,
    ProjectSupervisorInvite,
    ProjectTemplate,
    ProjectTemplateSection,
    ProjectType,
    StageMaterial,
    StageReviewDecision,
    StageSubmissionStatus,
    StageDeadlineChangeLog,
    StageStatus,
    SupervisorInviteStatus,
    Team,
)
from apps.users.models import SystemSetting, User, UserRole


class Command(BaseCommand):
    help = "Flush database and seed demo data for testing."

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Flushing database..."))
        call_command("flush", "--noinput")

        now = timezone.now()
        today = timezone.localdate()
        default_password = "Demo123!"

        self.stdout.write("Creating users...")
        users_data = [
            ("admin_demo", UserRole.ADMIN, "Админ", "Системный", "", ""),
            ("curator_demo", UserRole.CURATOR, "Елена", "Кураторова", "Игоревна", ""),
            ("methodist_demo", UserRole.METHODIST, "Ольга", "Методистова", "Павловна", ""),
            ("teacher_1", UserRole.TEACHER, "Иван", "Петров", "Алексеевич", ""),
            ("teacher_2", UserRole.TEACHER, "Мария", "Сидорова", "Сергеевна", ""),
            ("teacher_3", UserRole.TEACHER, "Алексей", "Кузнецов", "Дмитриевич", ""),
            ("student_1", UserRole.STUDENT, "Анна", "Соколова", "Ильинична", "ИС-222б"),
            ("student_2", UserRole.STUDENT, "Даниил", "Орлов", "Максимович", "ИС-222б"),
            ("student_3", UserRole.STUDENT, "Полина", "Иванова", "Андреевна", "ИС-223"),
            ("student_4", UserRole.STUDENT, "Кирилл", "Смирнов", "Олегович", "ИС-223"),
        ]

        users = []
        for idx, (username, role, first_name, last_name, middle_name, group_name) in enumerate(users_data, start=1):
            user = User.objects.create_user(
                username=username,
                password=default_password,
                role=role,
                first_name=first_name,
                last_name=last_name,
                middle_name=middle_name,
                group_name=group_name,
                email=f"{username}@example.com",
                phone=f"+79001000{idx:03d}",
                is_active=True,
                is_verified=True,
                is_staff=role in {UserRole.ADMIN},
                is_superuser=role in {UserRole.ADMIN},
            )
            users.append(user)

        teachers = [u for u in users if u.role == UserRole.TEACHER]
        students = [u for u in users if u.role == UserRole.STUDENT]
        curator = next(u for u in users if u.role == UserRole.CURATOR)

        self.stdout.write("Creating system settings...")
        for i in range(10):
            SystemSetting.objects.create(
                platform_name=f"Инженерия проектов (профиль {i + 1})",
                max_team_members=20,
                upcoming_deadline_days=7 + (i % 3),
                allow_public_feed=(i % 2 == 0),
            )

        self.stdout.write("Creating teams...")
        teams = []
        for i in range(10):
            team = Team.objects.create(
                name=f"Команда {i + 1:02d}",
                supervisor=teachers[i % len(teachers)],
            )
            teams.append(team)

        self.stdout.write("Creating team members...")
        for i in range(10):
            team = teams[i]
            student = students[i % len(students)]
            team.members.add(student)

        self.stdout.write("Creating projects...")
        project_statuses = [
            ProjectStatus.PLANNED,
            ProjectStatus.IN_PROGRESS,
            ProjectStatus.REVIEW,
            ProjectStatus.DONE,
            ProjectStatus.CANCELLED,
        ]
        project_types = [
            ProjectType.COURSEWORK,
            ProjectType.DIPLOMA,
            ProjectType.CONTEST,
            ProjectType.OLYMPIAD,
            ProjectType.OTHER,
        ]
        projects = []
        for i in range(10):
            start_date = today - timedelta(days=30 - i * 2)
            end_date = start_date + timedelta(days=20 + i)
            project = Project.objects.create(
                title=f"Проект {i + 1:02d}: {'Курсовой' if i % 2 == 0 else 'Творческий'}",
                description=f"Описание проекта {i + 1}",
                goal=f"Цель проекта {i + 1}",
                type=project_types[i % len(project_types)],
                status=project_statuses[i % len(project_statuses)],
                start_date=start_date,
                end_date=end_date,
                supervisor=teachers[i % len(teachers)],
                team=teams[i],
                is_published=(i % 4 == 0),
                cover_image_url=f"https://example.com/covers/project_{i + 1}.jpg" if i % 2 == 0 else "",
            )
            project.participants.set([students[i % len(students)]])
            projects.append(project)

        self.stdout.write("Creating project stages...")
        stage_statuses = [StageStatus.OPEN, StageStatus.SUBMITTED, StageStatus.CHANGES_REQUESTED, StageStatus.APPROVED]
        stages = []
        for i in range(10):
            stage = ProjectStage.objects.create(
                project=projects[i],
                title=f"Этап {i + 1}",
                description=f"Описание этапа {i + 1}",
                order=1,
                deadline=today + timedelta(days=5 + i),
                status=stage_statuses[i % len(stage_statuses)],
                student_report=f"Отчет по этапу {i + 1}",
                teacher_feedback=f"Комментарий преподавателя {i + 1}",
                updated_by=teachers[i % len(teachers)],
            )
            stages.append(stage)

        self.stdout.write("Creating project templates and sections...")
        templates = []
        for i in range(10):
            template = ProjectTemplate.objects.create(
                name=f"Шаблон {i + 1:02d}",
                project_type=project_types[i % len(project_types)],
                description=f"Шаблон документа для типа проекта {i + 1}",
                created_by=teachers[i % len(teachers)],
            )
            templates.append(template)
            ProjectTemplateSection.objects.create(
                template=template,
                title=f"Раздел {i + 1}",
                code=f"section-{i + 1}",
                order=1,
                default_task=f"Заполнить раздел {i + 1}",
            )

        self.stdout.write("Linking templates to projects...")
        for i in range(10):
            projects[i].template = templates[i]
            projects[i].auto_generated_stages = True
            projects[i].save(update_fields=["template", "auto_generated_stages", "updated_at"])

        self.stdout.write("Creating stage materials...")
        for i in range(10):
            StageMaterial.objects.create(
                stage=stages[i],
                file=f"stage_materials/material_{i + 1}.txt",
                uploaded_by=teachers[i % len(teachers)],
                description=f"Материал к этапу {i + 1}",
            )

        self.stdout.write("Creating deadline change logs...")
        for i in range(10):
            ProjectDeadlineChangeLog.objects.create(
                project=projects[i],
                old_start_date=projects[i].start_date - timedelta(days=3),
                new_start_date=projects[i].start_date,
                old_end_date=projects[i].end_date - timedelta(days=2),
                new_end_date=projects[i].end_date,
                reason=f"Корректировка сроков проекта {i + 1}",
                changed_by=curator,
            )
            StageDeadlineChangeLog.objects.create(
                stage=stages[i],
                old_deadline=stages[i].deadline - timedelta(days=1),
                new_deadline=stages[i].deadline,
                reason=f"Уточнение дедлайна этапа {i + 1}",
                changed_by=teachers[i % len(teachers)],
            )

        self.stdout.write("Creating comments...")
        comments = []
        for i in range(10):
            comment = ProjectComment.objects.create(
                project=projects[i],
                author=students[i % len(students)],
                text=f"Комментарий студента к проекту {i + 1}",
                is_approved=(i % 2 == 0),
            )
            comments.append(comment)

        self.stdout.write("Creating likes...")
        for i in range(10):
            ProjectLike.objects.create(
                project=projects[i],
                user=students[(i + 1) % len(students)],
            )

        self.stdout.write("Creating supervisor invites...")
        invite_statuses = [SupervisorInviteStatus.PENDING, SupervisorInviteStatus.ACCEPTED, SupervisorInviteStatus.DECLINED]
        invites = []
        for i in range(10):
            status = invite_statuses[i % len(invite_statuses)]
            responded_at = now if status != SupervisorInviteStatus.PENDING else None
            invite = ProjectSupervisorInvite.objects.create(
                project=projects[i],
                student=students[i % len(students)],
                teacher=teachers[(i + 1) % len(teachers)],
                message=f"Приглашение преподавателю по проекту {i + 1}",
                status=status,
                responded_at=responded_at,
            )
            invites.append(invite)

        self.stdout.write("Creating stage submissions and reviews...")
        for i in range(10):
            submission_status = [
                StageSubmissionStatus.DRAFT,
                StageSubmissionStatus.SUBMITTED,
                StageSubmissionStatus.NEEDS_CHANGES,
                StageSubmissionStatus.APPROVED,
            ][i % 4]
            submission = ProjectStageSubmission.objects.create(
                stage=stages[i],
                student=students[i % len(students)],
                submission_text=f"Сдача этапа {i + 1}",
                status=submission_status,
                submitted_at=now if submission_status != StageSubmissionStatus.DRAFT else None,
                checked_at=now if submission_status in {StageSubmissionStatus.NEEDS_CHANGES, StageSubmissionStatus.APPROVED} else None,
            )
            ProjectStageSubmissionFile.objects.create(
                submission=submission,
                file=f"stage_submissions/submission_{i + 1}.txt",
            )
            ProjectStageReview.objects.create(
                submission=submission,
                teacher=teachers[i % len(teachers)],
                decision=StageReviewDecision.APPROVED if i % 2 == 0 else StageReviewDecision.NEEDS_CHANGES,
                comment=f"Проверка этапа {i + 1}",
            )

        self.stdout.write("Creating notifications...")
        notification_types = list(NotificationType.values)
        for i in range(10):
            Notification.objects.create(
                recipient=users[i % len(users)],
                actor=curator,
                project=projects[i],
                stage=stages[i],
                type=notification_types[i % len(notification_types)],
                title=f"Уведомление {i + 1}",
                message=f"Тестовое уведомление {i + 1}",
                is_read=(i % 3 == 0),
            )

        self.stdout.write(self.style.SUCCESS("Done: database reset and seeded."))
        self.stdout.write("Default password for all users: Demo123!")
        self.stdout.write("Main logins: admin_demo, curator_demo, methodist_demo, teacher_1..3, student_1..4")
