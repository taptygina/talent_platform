from django.core.management.base import BaseCommand, CommandError
from django.test import Client
from django.core.files.uploadedfile import SimpleUploadedFile
from io import BytesIO

from openpyxl import Workbook

from apps.projects.models import Project, ProjectStatus, StageStatus


class Command(BaseCommand):
    help = "Run core smoke checks for auth/roles/projects/import-export."

    def _client(self) -> Client:
        return Client(HTTP_HOST="127.0.0.1")

    def _login(self, client: Client, username: str, password: str):
        response = client.post(
            "/api/auth/login/",
            data={"username": username, "password": password},
            content_type="application/json",
        )
        if response.status_code != 200:
            raise CommandError(f"Login failed for {username}: {response.status_code} {response.content!r}")

    def _logout(self, client: Client):
        response = client.post("/api/auth/logout/")
        if response.status_code != 204:
            raise CommandError(f"Logout failed: {response.status_code} {response.content!r}")

    def _assert_status(self, response, expected: int, title: str):
        if response.status_code != expected:
            raise CommandError(f"{title}: expected {expected}, got {response.status_code}, body={response.content!r}")

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("[1/9] Проверка входа/выхода"))
        client = self._client()
        self._login(client, "curator_demo", "Demo123!")
        me = client.get("/api/auth/me/")
        self._assert_status(me, 200, "GET /api/auth/me/")
        self._logout(client)

        self.stdout.write(self.style.NOTICE("[2/9] Проверка прав ролей"))
        student = self._client()
        self._login(student, "student_1", "Demo123!")
        forbidden_create = student.post(
            "/api/projects/",
            data={"title": "Тест запрета", "type": "other", "status": "planned", "group_name": "ИС-222б"},
            content_type="application/json",
        )
        if forbidden_create.status_code not in (403, 400):
            raise CommandError(f"Student create project must be denied: {forbidden_create.status_code}")
        self._logout(student)

        self.stdout.write(self.style.NOTICE("[3/9] Создание проекта преподавателем"))
        teacher = self._client()
        self._login(teacher, "teacher_1", "Demo123!")
        teacher_me = teacher.get("/api/auth/me/")
        self._assert_status(teacher_me, 200, "GET /api/auth/me/ (teacher)")
        teacher_id = teacher_me.json()["id"]
        create_project = teacher.post(
            "/api/projects/",
            data={
                "title": "Смоук-проект",
                "description": "Проверка ключевых сценариев",
                "type": "coursework",
                "status": "planned",
                "group_name": "ИС-222б",
                "supervisor_id": teacher_id,
            },
            content_type="application/json",
        )
        self._assert_status(create_project, 201, "POST /api/projects/")
        project_id = create_project.json()["id"]

        self.stdout.write(self.style.NOTICE("[4/9] Создание этапа и комментария"))
        create_stage = teacher.post(
            "/api/projects/stages/",
            data={
                "project": project_id,
                "title": "Этап 1",
                "description": "Смоук-этап",
                "order": 1,
                "status": "approved",
            },
            content_type="application/json",
        )
        self._assert_status(create_stage, 201, "POST /api/projects/stages/")

        comment = teacher.post(
            "/api/projects/comments/",
            data={"project": project_id, "text": "Комментарий проверки"},
            content_type="application/json",
        )
        self._assert_status(comment, 201, "POST /api/projects/comments/")
        self._logout(teacher)

        self.stdout.write(self.style.NOTICE("[5/9] Лайк/комментарий студентом"))
        student = self._client()
        self._login(student, "student_1", "Demo123!")
        like = student.post(f"/api/projects/{project_id}/like/")
        self._assert_status(like, 200, "POST /api/projects/{id}/like/")
        student_comment = student.post(
            "/api/projects/comments/",
            data={"project": project_id, "text": "Комментарий студента"},
            content_type="application/json",
        )
        self._assert_status(student_comment, 201, "POST /api/projects/comments/ (student)")
        self._logout(student)

        self.stdout.write(self.style.NOTICE("[6/9] Публикация куратором"))
        project = Project.objects.get(id=project_id)
        project.status = ProjectStatus.DONE
        project.cover_image_url = "https://example.com/covers/smoke.jpg"
        project.save(update_fields=["status", "cover_image_url", "updated_at"])
        Project.objects.filter(id=project_id).update(status=ProjectStatus.DONE)

        curator = self._client()
        self._login(curator, "curator_demo", "Demo123!")
        publish = curator.post(f"/api/projects/{project_id}/publish/")
        self._assert_status(publish, 200, "POST /api/projects/{id}/publish/")

        self.stdout.write(self.style.NOTICE("[7/9] Импорт пользователей + PDF с учетками"))
        wb = Workbook()
        ws = wb.active
        ws.append(["first_name", "last_name", "middle_name", "email", "phone", "group_name"])
        ws.append(["Тест", "Импортов", "А", "import@test.local", "+79990001122", "ИС-222б"])
        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)
        upload = SimpleUploadedFile(
            "import.xlsx",
            buf.read(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

        import_resp = curator.post("/api/auth/import-users/", data={"role": "student", "file": upload})
        self._assert_status(import_resp, 201, "POST /api/auth/import-users/")
        accounts = import_resp.json().get("generated_accounts") or []
        if not accounts:
            raise CommandError("Import created no accounts")

        pdf_resp = curator.post(
            "/api/auth/import-users/credentials-pdf/",
            data={"role": "student", "accounts": accounts},
            content_type="application/json",
        )
        self._assert_status(pdf_resp, 200, "POST /api/auth/import-users/credentials-pdf/")

        self.stdout.write(self.style.NOTICE("[8/9] Экспорт XLSX и DOCX"))
        matrix = curator.get(f"/api/projects/{project_id}/export-matrix-xlsx/")
        self._assert_status(matrix, 200, "GET /api/projects/{id}/export-matrix-xlsx/")

        # Для DOCX требуется статус done и все этапы approved.
        Project.objects.filter(id=project_id).update(status=ProjectStatus.DONE)
        Project.objects.get(id=project_id).stages.update(status=StageStatus.APPROVED)
        docx = curator.get(f"/api/projects/{project_id}/export-nirs-docx/")
        self._assert_status(docx, 200, "GET /api/projects/{id}/export-nirs-docx/")
        self._logout(curator)

        self.stdout.write(self.style.NOTICE("[9/9] Быстрая проверка пагинации/поиска/фильтрации"))
        checker = self._client()
        self._login(checker, "curator_demo", "Demo123!")
        list_resp = checker.get("/api/projects/", data={"page": 1, "search": "проект", "status": "done", "ordering": "-created_at"})
        self._assert_status(list_resp, 200, "GET /api/projects/")
        payload = list_resp.json()
        if "results" not in payload or "count" not in payload:
            raise CommandError("Pagination payload is invalid")
        self._logout(checker)

        self.stdout.write(self.style.SUCCESS("Smoke-check пройден: критические сценарии работают."))
