import re
from typing import Any

from apps.projects.models import Project, ProjectTemplate
from apps.users.models import User


PLACEHOLDER_RE = re.compile(r"\{\{\s*([A-ZА-Я_]+)\s*\}\}")


def _full_name(user: User | None) -> str:
    if not user:
        return ""
    if getattr(user, "full_name", ""):
        return user.full_name
    parts = [getattr(user, "last_name", ""), getattr(user, "first_name", ""), getattr(user, "middle_name", "")]
    fallback = " ".join([part for part in parts if part]).strip()
    return fallback or getattr(user, "username", "")


def render_placeholders(
    text: str,
    *,
    student: User | None = None,
    supervisor: User | None = None,
    project: Project | None = None,
) -> str:
    source = text or ""
    mapping = {
        "STUDENT_FULL_NAME": _full_name(student),
        "STUDENT_GROUP": getattr(student, "group_name", "") if student else "",
        "TEACHER_FULL_NAME": _full_name(supervisor),
        "SUPERVISOR_FULL_NAME": _full_name(supervisor),
        "PROJECT_TITLE": getattr(project, "title", "") if project else "",
        "ФИО_СТУДЕНТА": _full_name(student),
        "ГРУППА_СТУДЕНТА": getattr(student, "group_name", "") if student else "",
        "ФИО_ПРЕПОДАВАТЕЛЯ": _full_name(supervisor),
        "ФИО_РУКОВОДИТЕЛЯ": _full_name(supervisor),
        "НАЗВАНИЕ_ПРОЕКТА": getattr(project, "title", "") if project else "",
    }

    def replace_match(match: re.Match[str]) -> str:
        key = (match.group(1) or "").strip().upper()
        return mapping.get(key, match.group(0))

    return PLACEHOLDER_RE.sub(replace_match, source)


def _iter_doc_strings(doc: Any):
    for paragraph in doc.paragraphs:
        yield paragraph.text or ""
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    yield paragraph.text or ""


def build_template_editor_profile(template: ProjectTemplate) -> dict[str, Any]:
    profile: dict[str, Any] = {
        "defaults": {
            "font_family": "",
            "font_size_pt": None,
            "text_align": "left",
            "line_spacing": None,
        },
        "page": {
            "margin_top_cm": None,
            "margin_right_cm": None,
            "margin_bottom_cm": None,
            "margin_left_cm": None,
        },
        "placeholders": [],
    }

    if not template.template_file:
        return profile

    try:
        from docx import Document
    except Exception:
        return profile

    try:
        doc = Document(template.template_file.path)
    except Exception:
        return profile

    normal_style = doc.styles["Normal"]
    font = normal_style.font
    if font and font.name:
        profile["defaults"]["font_family"] = font.name
    if font and font.size:
        profile["defaults"]["font_size_pt"] = float(font.size.pt)

    first_paragraph = next((p for p in doc.paragraphs if (p.text or "").strip()), None)
    if first_paragraph and first_paragraph.alignment is not None:
        align_map = {0: "left", 1: "center", 2: "right", 3: "justify"}
        profile["defaults"]["text_align"] = align_map.get(int(first_paragraph.alignment), "left")
    if first_paragraph and first_paragraph.paragraph_format and first_paragraph.paragraph_format.line_spacing:
        try:
            profile["defaults"]["line_spacing"] = float(first_paragraph.paragraph_format.line_spacing)
        except Exception:
            profile["defaults"]["line_spacing"] = None

    if doc.sections:
        section = doc.sections[0]
        for key, value in (
            ("margin_top_cm", section.top_margin),
            ("margin_right_cm", section.right_margin),
            ("margin_bottom_cm", section.bottom_margin),
            ("margin_left_cm", section.left_margin),
        ):
            if value is not None:
                try:
                    profile["page"][key] = round(float(value.cm), 2)
                except Exception:
                    profile["page"][key] = None

    found = set()
    for text in _iter_doc_strings(doc):
        for match in PLACEHOLDER_RE.finditer(text):
            found.add(match.group(1).strip().upper())
    profile["placeholders"] = sorted(found)
    return profile
