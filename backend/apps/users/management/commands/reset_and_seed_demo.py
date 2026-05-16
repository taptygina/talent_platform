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
            first_name="Андрей",
            last_name="Иванов",
            middle_name="Сергеевич",
            email="admin@talent-platform.local",
            phone="+79001000001",
            is_verified=True,
        )
        curator = User.objects.create_user(
            username="curator",
            password=default_password,
            role=UserRole.CURATOR,
            first_name="Ольга",
            last_name="Смирнова",
            middle_name="Викторовна",
            email="curator@talent-platform.local",
            phone="+79001000002",
            is_verified=True,
        )
        methodist = User.objects.create_user(
            username="method",
            password=default_password,
            role=UserRole.METHODIST,
            first_name="Ирина",
            last_name="Коваленко",
            middle_name="Петровна",
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
            platform_name="Платформа талантов и проектов",
            max_team_members=12,
            upcoming_deadline_days=10,
            allow_public_feed=True,
        )

        self.stdout.write("Creating teams...")
        team_specs = [
            ("Лаборатория цифрового производства", TeamKind.CREATIVE, ""),
            ("Команда промышленной аналитики", TeamKind.CREATIVE, ""),
            ("Проектная группа умной логистики", TeamKind.CREATIVE, ""),
            ("Студия образовательных сервисов", TeamKind.CREATIVE, ""),
            ("Команда карьерной навигации", TeamKind.CREATIVE, ""),
            ("ИС-222б", TeamKind.ACADEMIC, "ИС-222б"),
            ("ИС-223", TeamKind.ACADEMIC, "ИС-223"),
            ("ИВТ-221", TeamKind.ACADEMIC, "ИВТ-221"),
            ("ПМИ-224", TeamKind.ACADEMIC, "ПМИ-224"),
            ("ПИН-225", TeamKind.ACADEMIC, "ПИН-225"),
        ]
        teams: list[Team] = []
        for idx, (name, kind, group_name) in enumerate(team_specs, start=1):
            team = Team.objects.create(
                name=name,
                kind=kind,
                group_name=group_name,
                supervisor=teachers[(idx - 1) % len(teachers)],
            )
            teams.append(team)
            team.members.add(*students[(idx - 1) * 4 : idx * 4])

        self.stdout.write("Creating templates and sections...")
        template_specs = [
            ("Шаблон исследовательского проекта", ProjectType.COURSEWORK),
            ("Шаблон выпускной квалификационной работы", ProjectType.DIPLOMA),
            ("Шаблон индустриального кейса", ProjectType.CONTEST),
            ("Шаблон проектной олимпиады", ProjectType.OLYMPIAD),
            ("Шаблон инициативы кластера", ProjectType.OTHER),
        ]
        section_titles = ["Постановка задачи", "Анализ предметной области", "Проектирование решения", "Реализация", "Оценка результата"]

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
            "Цифровой паспорт компетенций участников кластера",
            "Система подбора студентов под индустриальные кейсы",
            "Панель мониторинга загрузки проектных команд",
            "Сервис согласования наставников и проектных ролей",
            "Модуль оценки готовности проекта к демонстрации",
            "Карта исследовательских запросов предприятий-партнеров",
            "Система контроля этапов выпускных проектов",
            "Портал лучших практик учебно-производственных кластеров",
            "Трекер рисков для междисциплинарных команд",
            "Сервис проверки полноты проектной документации",
        ]
        project_descriptions = [
            "Единый профиль участника с навыками, проектным опытом и рекомендациями для кураторов.",
            "Инструмент сопоставления требований предприятий с компетенциями студентов и их занятостью.",
            "Аналитическая панель для преподавателей и кураторов с балансом задач, сроков и нагрузки.",
            "Сервис для выбора наставника, распределения ролей и фиксации зон ответственности.",
            "Модуль чек-листов и экспертной оценки перед публичной защитой решения.",
            "Каталог реальных задач партнеров с фильтрацией по отрасли, технологии и уровню сложности.",
            "Рабочее пространство для отслеживания этапов, замечаний и готовности ВКР.",
            "Публичная витрина реализованных решений, кейсов и результатов команд.",
            "Инструмент регистрации рисков, владельцев, мер реагирования и контрольных точек.",
            "Проверка состава документов, статусов согласования и требований к оформлению.",
        ]
        project_goals = [
            "Сократить время поиска подходящих участников для новых проектов.",
            "Повысить точность распределения студентов по задачам предприятий.",
            "Сделать загрузку команд прозрачной для кураторов и руководителей.",
            "Снизить число конфликтов ролей и ускорить старт проектной работы.",
            "Повысить качество подготовки решений к промежуточной и итоговой защите.",
            "Собрать единое окно входа для запросов индустриальных партнеров.",
            "Снизить риск просрочек и потери замечаний по выпускным проектам.",
            "Расширить обмен успешными практиками между учебными и производственными площадками.",
            "Научить команды заранее видеть угрозы срокам и качеству результата.",
            "Уменьшить количество возвратов документов из-за неполного комплекта.",
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
                description=project_descriptions[idx - 1],
                goal=project_goals[idx - 1],
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
                    description=f"Подготовить результат этапа «{section.title}» для проекта «{title}».",
                    order=order,
                    deadline=start_date + timedelta(days=order * 7),
                    task_text=section.default_task,
                    status=[StageStatus.OPEN, StageStatus.SUBMITTED, StageStatus.CHANGES_REQUESTED, StageStatus.APPROVED][
                        (idx + order) % 4
                    ],
                    student_report="Команда загрузила материалы этапа и отметила выполненные задачи.",
                    teacher_feedback="Проверены полнота материалов, логика решения и соответствие требованиям этапа.",
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
                    comment="Материалы проверены. Уточните метрики результата и добавьте ссылки на подтверждающие артефакты.",
                )

            ProjectDeadlineChangeLog.objects.create(
                project=project,
                old_start_date=start_date - timedelta(days=2),
                new_start_date=start_date,
                old_end_date=end_date - timedelta(days=3),
                new_end_date=end_date,
                reason="Сроки скорректированы после согласования с индустриальным партнером",
                changed_by=curator,
            )
            StageDeadlineChangeLog.objects.create(
                stage=stages[0],
                old_deadline=stages[0].deadline - timedelta(days=2),
                new_deadline=stages[0].deadline,
                reason="Этап перенесен после уточнения требований к прототипу",
                changed_by=supervisor,
            )

            for comment_idx, author in enumerate(participants, start=1):
                ProjectComment.objects.create(
                    project=project,
                    stage=stages[(comment_idx - 1) % len(stages)] if comment_idx % 2 == 0 else None,
                    author=author,
                    text=[
                        f"Добавили исходные требования и список заинтересованных сторон по проекту «{title}».",
                        f"Нужна проверка схемы данных и показателей результата для проекта «{title}».",
                        f"После ревью обновим план демонстрации проекта «{title}».",
                    ][comment_idx - 1],
                    is_approved=True,
                )

            ProjectLike.objects.create(project=project, user=participants[0])
            ProjectLike.objects.create(project=project, user=participants[1])

            ProjectSupervisorInvite.objects.create(
                project=project,
                student=participants[0],
                teacher=teachers[idx % len(teachers)],
                message=f"Просим подключиться как наставника по проекту «{title}» и помочь с экспертной оценкой решения.",
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
                title=f"Обновление по проекту: {project.title}",
                message=f"По проекту «{project.title}» зарегистрировано событие «{notif_type}». Проверьте текущий статус этапа.",
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
