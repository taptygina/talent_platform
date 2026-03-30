from io import BytesIO

from django.http import HttpResponse
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.projects.models import (
    Project,
    ProjectStageSubmission,
    ProjectStatus,
    StageStatus,
    StageSubmissionStatus,
)
from apps.users.models import UserRole


class ProjectExportNirsDocxView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            project = Project.objects.select_related("supervisor", "template").get(pk=pk)
        except Project.DoesNotExist:
            return Response({"detail": "Проект не найден."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        if user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        if user.role == UserRole.TEACHER and project.supervisor_id != user.id:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        if project.status != ProjectStatus.DONE:
            return Response({"detail": "Проект должен быть в статусе «Завершен»."}, status=status.HTTP_400_BAD_REQUEST)
        if project.stages.exclude(status=StageStatus.APPROVED).exists():
            return Response({"detail": "Перед выгрузкой все этапы должны быть в статусе «Принят»."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from docx import Document
        except Exception:
            return Response(
                {"detail": "Для генерации .docx установите зависимость python-docx."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        doc = Document()
        doc.add_heading(project.title, level=1)
        if project.description:
            doc.add_paragraph(project.description)
        doc.add_paragraph(f"Тип проекта: {project.type}")
        doc.add_paragraph(f"Руководитель: {project.supervisor.full_name or project.supervisor.username}")
        if project.academic_group_name:
            doc.add_paragraph(f"Академическая группа: {project.academic_group_name}")
        if project.team_id:
            doc.add_paragraph(f"Команда: {project.team.name}")

        if project.template_id:
            doc.add_paragraph(f"Шаблон НРС: {project.template.name}")

        # Build sections from template first; fallback to plain stage ordering.
        sections = []
        if project.template_id and project.template.sections.exists():
            for section in project.template.sections.order_by("order", "id"):
                stage = project.stages.filter(template_section=section).order_by("order", "id").first()
                if not stage:
                    stage = project.stages.filter(order=section.order).order_by("id").first()
                sections.append((section.title, stage))
        else:
            for stage in project.stages.order_by("order", "id"):
                sections.append((stage.title, stage))

        for idx, (section_title, stage) in enumerate(sections, start=1):
            doc.add_heading(f"{idx}. {section_title}", level=2)
            if not stage:
                doc.add_paragraph("Этап для этого раздела не найден.")
                continue
            if stage.task_text:
                doc.add_paragraph(f"Задание этапа: {stage.task_text}")
            if stage.description:
                doc.add_paragraph(stage.description)

            approved_submissions = (
                ProjectStageSubmission.objects.select_related("student")
                .filter(stage=stage, status=StageSubmissionStatus.APPROVED)
                .order_by("student__last_name", "student__first_name")
            )

            if not approved_submissions.exists():
                doc.add_paragraph("Нет подтвержденных сдач по разделу.")
                continue

            for submission in approved_submissions:
                student_name = submission.student.full_name or submission.student.username
                doc.add_heading(f"Студент: {student_name}", level=3)
                doc.add_paragraph(submission.submission_text or "-")
                review = submission.reviews.order_by("-created_at").first()
                if review and review.comment:
                    doc.add_paragraph(f"Комментарий преподавателя: {review.comment}")

        buffer = BytesIO()
        doc.save(buffer)
        buffer.seek(0)
        filename = f"nirs_project_{project.id}.docx"
        response = HttpResponse(
            buffer.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class ProjectExportMatrixXlsxView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            project = Project.objects.select_related("supervisor").prefetch_related("participants", "stages").get(pk=pk)
        except Project.DoesNotExist:
            return Response({"detail": "Проект не найден."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        if user.role not in {UserRole.TEACHER, UserRole.CURATOR, UserRole.ADMIN, UserRole.METHODIST}:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)
        if user.role == UserRole.TEACHER and project.supervisor_id != user.id:
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)

        try:
            from openpyxl import Workbook
            from openpyxl.styles import Alignment, Font, PatternFill
            from openpyxl.utils import get_column_letter
        except Exception:
            return Response(
                {"detail": "Для генерации .xlsx установите зависимость openpyxl."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        status_label = {
            "draft": "Черновик",
            "submitted": "На проверке",
            "needs_changes": "Нужны доработки",
            "approved": "Принято",
        }
        project_status_label = {
            "planned": "Запланирован",
            "in_progress": "В работе",
            "review": "На проверке",
            "done": "Завершен",
            "cancelled": "Отменен",
        }
        status_fill = {
            "draft": "FFF2CC",
            "submitted": "D9E1F2",
            "needs_changes": "F8CBAD",
            "approved": "D9EAD3",
            "none": "EAEAEA",
        }

        students = list(project.participants.filter(role=UserRole.STUDENT).order_by("last_name", "first_name"))
        stages = list(project.stages.order_by("order", "id"))

        wb = Workbook()
        ws = wb.active
        ws.title = "Матрица этапов"

        ws["A1"] = f"Проект: {project.title}"
        ws["A1"].font = Font(bold=True, size=13)
        ws["A2"] = f"Руководитель: {project.supervisor.full_name or project.supervisor.username}"
        ws["A3"] = f"Статус проекта: {project_status_label.get(project.status, project.status)}"

        header_row = 5
        ws.cell(row=header_row, column=1, value="Студент")
        ws.cell(row=header_row, column=1).font = Font(bold=True)

        for col_idx, stage in enumerate(stages, start=2):
            ws.cell(row=header_row, column=col_idx, value=f"{stage.order}. {stage.title}")
            ws.cell(row=header_row, column=col_idx).font = Font(bold=True)
            ws.cell(row=header_row, column=col_idx).alignment = Alignment(wrap_text=True, vertical="top")

        for row_idx, student in enumerate(students, start=header_row + 1):
            student_name = student.full_name or student.username
            ws.cell(row=row_idx, column=1, value=student_name)
            ws.cell(row=row_idx, column=1).font = Font(bold=True)
            for col_idx, stage in enumerate(stages, start=2):
                submission = (
                    ProjectStageSubmission.objects.filter(stage=stage, student=student)
                    .order_by("-updated_at")
                    .first()
                )
                if submission:
                    key = submission.status
                    label = status_label.get(key, submission.status)
                else:
                    key = "none"
                    label = "Нет сдачи"
                cell = ws.cell(row=row_idx, column=col_idx, value=label)
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.fill = PatternFill(start_color=status_fill.get(key, "EAEAEA"), end_color=status_fill.get(key, "EAEAEA"), fill_type="solid")

        ws.column_dimensions["A"].width = 34
        for col_idx in range(2, len(stages) + 2):
            ws.column_dimensions[get_column_letter(col_idx)].width = 22

        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        filename = f"project_matrix_{project.id}.xlsx"
        response = HttpResponse(
            buffer.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

