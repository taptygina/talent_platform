from __future__ import annotations

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
    ProjectStage,
    ProjectStageReview,
    ProjectStageSubmission,
    ProjectStatus,
    ProjectSupervisorInvite,
    ProjectTemplate,
    ProjectTemplateSection,
    ProjectType,
    StageDeadlineChangeLog,
    StageReviewDecision,
    StageStatus,
    StageSubmissionStatus,
    SupervisorInviteStatus,
    Team,
    TeamKind,
)
from apps.users.models import SystemSetting, User, UserRole


class Command(BaseCommand):
    help = "Fully flush DB and create realistic demo data for project defense."

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Flushing database..."))
        call_command("flush", "--noinput")

        now = timezone.now()
        today = timezone.localdate()
        default_password = "Demo12345"

        self.stdout.write("Creating base users...")
        admin = User.objects.create_superuser(
            username="admin",
            password=default_password,
            role=UserRole.ADMIN,
            first_name="??????",
            last_name="????????",
            middle_name="?????????",
            email="admin@talent-platform.local",
            phone="+79001000001",
            is_verified=True,
        )
        curator = User.objects.create_user(
            username="curator",
            password=default_password,
            role=UserRole.CURATOR,
            first_name="?????",
            last_name="??????????",
            middle_name="????????",
            email="curator@talent-platform.local",
            phone="+79001000002",
            is_verified=True,
        )
        methodist = User.objects.create_user(
            username="method",
            password=default_password,
            role=UserRole.METHODIST,
            first_name="?????",
            last_name="???????????",
            middle_name="????????",
            email="methodist@talent-platform.local",
            phone="+79001000003",
            is_verified=True,
        )

        teacher_names = [
            ("Иван", "Петров", "Алексеевич"),
            ("Мария", "Сидорова", "Сергеевна"),
            ("Алексей", "Кузнецов", "Дмитриевич"),
            ("Наталья", "Власова", "Андреевна"),
            ("Павел", "Романов", "Ильич"),
            ("Екатерина", "Зайцева", "Олеговна"),
        ]
        teachers: list[User] = []
        for idx, (first_name, last_name, middle_name) in enumerate(teacher_names, start=1):
            teachers.append(
                User.objects.create_user(
                    username=f"t{idx:02d}",
                    password=default_password,
                    role=UserRole.TEACHER,
                    first_name=first_name,
                    last_name=last_name,
                    middle_name=middle_name,
                    email=f"teacher{idx}@talent-platform.local",
                    phone=f"+79001001{idx:03d}",
                    is_verified=True,
                )
            )

        student_names = [
            ("Анна", "Соколова", "Ильинична"),
            ("Даниил", "Орлов", "Максимович"),
            ("Полина", "Иванова", "Андреевна"),
            ("Кирилл", "Смирнов", "Олегович"),
            ("Артем", "Козлов", "Романович"),
            ("Виктория", "Лебедева", "Павловна"),
            ("Илья", "Морозов", "Игоревич"),
            ("София", "Новикова", "Алексеевна"),
            ("Егор", "Федоров", "Ильич"),
            ("Дарья", "Тихонова", "Сергеевна"),
            ("Максим", "Громов", "Андреевич"),
            ("Алина", "Гусева", "Владимировна"),
            ("Тимур", "Егоров", "Романович"),
            ("Вероника", "Полякова", "Юрьевна"),
            ("Никита", "Белов", "Петрович"),
            ("Ксения", "Макарова", "Олеговна"),
            ("Роман", "Семенов", "Викторович"),
            ("Маргарита", "Демина", "Игоревна"),
            ("Станислав", "Жуков", "Валерьевич"),
            ("Анастасия", "Тарасова", "Павловна"),
            ("Георгий", "Савельев", "Андреевич"),
            ("Елизавета", "Прохорова", "Сергеевна"),
            ("Олег", "Карпов", "Константинович"),
            ("Юлия", "Алексеева", "Викторовна"),
            ("Дмитрий", "Афанасьев", "Романович"),
            ("Валерия", "Крылова", "Ильинична"),
            ("Михаил", "Брагин", "Юрьевич"),
            ("Таисия", "Горбунова", "Павловна"),
            ("Арсений", "Корнилов", "Олегович"),
            ("Кристина", "Фомина", "Сергеевна"),
            ("Ярослав", "Николаев", "Игоревич"),
            ("Марина", "Рябова", "Алексеевна"),
            ("Петр", "Суханов", "Андреевич"),
            ("Ульяна", "Калинина", "Владимировна"),
            ("Глеб", "Воронцов", "Петрович"),
            ("Оксана", "Ларионова", "Игоревна"),
            ("Матвей", "Шестаков", "Романович"),
            ("Инна", "Лукина", "Дмитриевна"),
            ("Руслан", "Панин", "Олегович"),
            ("Ева", "Синицына", "Павловна"),
        ]
        groups = ["ИС-222б", "ИС-223", "ИВТ-221", "ПМИ-224", "ПИН-225"]

        self.stdout.write("Creating students...")
        students: list[User] = []
        for idx, (first_name, last_name, middle_name) in enumerate(student_names, start=1):
            students.append(
                User.objects.create_user(
                    username=f"s{idx:02d}",
                    password=default_password,
                    role=UserRole.STUDENT,
                    first_name=first_name,
                    last_name=last_name,
                    middle_name=middle_name,
                    group_name=groups[(idx - 1) % len(groups)],
                    email=f"student{idx}@talent-platform.local",
                    phone=f"+7900200{idx:04d}",
                    is_verified=True,
                )
            )

        self.stdout.write("Creating platform settings...")
        SystemSetting.objects.create(
            platform_name="Инженерия проектов",
            max_team_members=12,
            upcoming_deadline_days=10,
            allow_public_feed=True,
        )

        self.stdout.write("Creating teams...")
        teams: list[Team] = []
        for idx in range(1, 11):
            team = Team.objects.create(
                name=f"Команда {idx:02d}",
                kind=TeamKind.CREATIVE if idx <= 5 else TeamKind.ACADEMIC,
                group_name=groups[(idx - 1) % len(groups)] if idx > 5 else "",
                supervisor=teachers[(idx - 1) % len(teachers)],
            )
            teams.append(team)
            team.members.add(*students[(idx - 1) * 4 : idx * 4])

        self.stdout.write("Creating templates and sections...")
        template_specs = [
            ("Шаблон НИРС", ProjectType.COURSEWORK),
            ("Шаблон диплома", ProjectType.DIPLOMA),
            ("Шаблон хакатона", ProjectType.CONTEST),
            ("Шаблон олимпиады", ProjectType.OLYMPIAD),
            ("Универсальный шаблон", ProjectType.OTHER),
        ]
        section_titles = ["Введение", "Аналитика", "Проектирование", "Реализация", "Выводы"]

        templates: list[ProjectTemplate] = []
        for idx, (name, project_type) in enumerate(template_specs, start=1):
            template = ProjectTemplate.objects.create(
                name=name,
                project_type=project_type,
                description=f"{name} для учебного проекта",
                created_by=methodist,
                format_profile={"font_family": "Times New Roman", "font_size": 14, "line_spacing": 1.5},
            )
            templates.append(template)
            for order, section in enumerate(section_titles, start=1):
                ProjectTemplateSection.objects.create(
                    template=template,
                    title=section,
                    code=f"{idx}-{order}",
                    order=order,
                    default_task=f"Подготовить раздел «{section}»",
                )

        project_titles = [
            "Система мониторинга учебных дедлайнов",
            "Платформа сопровождения НИРС",
            "Сервис визуализации карьерных треков",
            "Веб-приложение распределения ролей в командах",
            "Модуль оценки проектных компетенций",
            "Интерактивная карта исследовательских задач",
            "Инструмент контроля качества этапов",
            "Портал публикации студенческих кейсов",
            "Трекер проектных рисков",
            "Сервис проверки полноты проектной документации",
        ]
        project_statuses = [
            ProjectStatus.PLANNED,
            ProjectStatus.IN_PROGRESS,
            ProjectStatus.REVIEW,
            ProjectStatus.DONE,
            ProjectStatus.CANCELLED,
        ]

        self.stdout.write("Creating projects, stages and activity...")
        projects: list[Project] = []
        for idx, title in enumerate(project_titles, start=1):
            start_date = today - timedelta(days=35 - idx * 2)
            end_date = start_date + timedelta(days=45)
            template = templates[(idx - 1) % len(templates)]
            team = teams[(idx - 1) % len(teams)]
            supervisor = teachers[(idx - 1) % len(teachers)]

            project = Project.objects.create(
                title=title,
                description=f"{title}. Основной учебно-исследовательский проект.",
                goal=f"Достичь измеримого результата по теме «{title.lower()}».",
                type=template.project_type,
                status=project_statuses[(idx - 1) % len(project_statuses)],
                start_date=start_date,
                end_date=end_date,
                supervisor=supervisor,
                academic_group_name=team.group_name,
                team=team,
                is_published=idx % 3 == 0,
                is_archived=idx % 10 == 0,
                cover_image_url="",
                template=template,
                auto_generated_stages=True,
            )
            participants = list(team.members.all())[:3]
            project.participants.set(participants)
            projects.append(project)

            stages: list[ProjectStage] = []
            for order, section in enumerate(template.sections.all(), start=1):
                stage = ProjectStage.objects.create(
                    project=project,
                    template_section=section,
                    title=f"Этап {order}. {section.title}",
                    description=f"Выполнить этап «{section.title}» для проекта «{title}».",
                    order=order,
                    deadline=start_date + timedelta(days=order * 7),
                    task_text=section.default_task,
                    status=[StageStatus.OPEN, StageStatus.SUBMITTED, StageStatus.CHANGES_REQUESTED, StageStatus.APPROVED][
                        (idx + order) % 4
                    ],
                    student_report="Отчет загружен в систему.",
                    teacher_feedback="Комментарий преподавателя по этапу.",
                    updated_by=supervisor,
                )
                stages.append(stage)

            for order, stage in enumerate(stages, start=1):
                student = participants[(order - 1) % len(participants)]
                submission_status = [
                    StageSubmissionStatus.DRAFT,
                    StageSubmissionStatus.SUBMITTED,
                    StageSubmissionStatus.NEEDS_CHANGES,
                    StageSubmissionStatus.APPROVED,
                ][(idx + order) % 4]
                submission = ProjectStageSubmission.objects.create(
                    stage=stage,
                    student=student,
                    submission_text=f"Сдача этапа {order} по проекту «{title}».",
                    status=submission_status,
                    submitted_at=now - timedelta(days=max(1, 12 - order)) if submission_status != StageSubmissionStatus.DRAFT else None,
                    checked_at=now - timedelta(days=max(1, 10 - order))
                    if submission_status in {StageSubmissionStatus.NEEDS_CHANGES, StageSubmissionStatus.APPROVED}
                    else None,
                )
                ProjectStageReview.objects.create(
                    submission=submission,
                    teacher=supervisor,
                    decision=StageReviewDecision.APPROVED if order % 2 == 0 else StageReviewDecision.NEEDS_CHANGES,
                    score=80 + (idx + order) % 21,
                    comment="Проверка выполнена, см. рекомендации в комментариях.",
                )

            ProjectDeadlineChangeLog.objects.create(
                project=project,
                old_start_date=start_date - timedelta(days=2),
                new_start_date=start_date,
                old_end_date=end_date - timedelta(days=3),
                new_end_date=end_date,
                reason="Уточнение календарного графика проекта",
                changed_by=curator,
            )
            StageDeadlineChangeLog.objects.create(
                stage=stages[0],
                old_deadline=stages[0].deadline - timedelta(days=2),
                new_deadline=stages[0].deadline,
                reason="Согласование сроков с преподавателем",
                changed_by=supervisor,
            )

            for comment_idx, author in enumerate(participants, start=1):
                ProjectComment.objects.create(
                    project=project,
                    stage=stages[(comment_idx - 1) % len(stages)] if comment_idx % 2 == 0 else None,
                    author=author,
                    text=f"Комментарий {comment_idx} по проекту «{title}».",
                    is_approved=True,
                )

            ProjectLike.objects.create(project=project, user=participants[0])
            ProjectLike.objects.create(project=project, user=participants[1])

            ProjectSupervisorInvite.objects.create(
                project=project,
                student=participants[0],
                teacher=teachers[idx % len(teachers)],
                message=f"Просьба подключиться к проекту «{title}».",
                status=[SupervisorInviteStatus.PENDING, SupervisorInviteStatus.ACCEPTED, SupervisorInviteStatus.DECLINED][
                    idx % 3
                ],
                responded_at=now - timedelta(days=idx % 5) if idx % 3 != 0 else None,
            )

        self.stdout.write("Creating notifications...")
        all_users = [admin, curator, methodist] + teachers + students
        notification_types = list(NotificationType.values)
        for idx in range(1, 26):
            recipient = all_users[idx % len(all_users)]
            project = projects[(idx - 1) % len(projects)]
            stage = project.stages.all()[(idx - 1) % project.stages.count()]
            notif_type = notification_types[(idx - 1) % len(notification_types)]
            Notification.objects.create(
                recipient=recipient,
                actor=curator,
                project=project,
                stage=stage,
                type=notif_type,
                title=f"Уведомление: {project.title}",
                message=f"Событие «{notif_type}» по проекту «{project.title}».",
                is_read=idx % 4 == 0,
            )

        total_records = (
            User.objects.count()
            + Team.objects.count()
            + ProjectTemplate.objects.count()
            + Project.objects.count()
            + ProjectStage.objects.count()
            + ProjectComment.objects.count()
            + Notification.objects.count()
        )

        self.stdout.write(self.style.SUCCESS("Done: database reset and demo data created."))
        self.stdout.write(f"Total core records created: {total_records}")
        self.stdout.write("Accounts password for demo users: Demo12345")
        self.stdout.write("Main logins: admin, curator, method, t01..t06, s01..s40")
