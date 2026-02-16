import re
import secrets
import string
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from django.contrib.auth import get_user_model
from django.db import transaction
from openpyxl import Workbook, load_workbook
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from apps.users.models import UserRole

User = get_user_model()

REQUIRED_COLUMNS = {"first_name", "last_name"}
OPTIONAL_COLUMNS = {"middle_name", "email", "phone", "group_name"}
ALL_COLUMNS = REQUIRED_COLUMNS | OPTIONAL_COLUMNS
TEMPLATE_COLUMNS = ("first_name", "last_name", "middle_name", "email", "phone", "group_name")


def _resolve_pdf_font_name() -> str:
    """
    Register a Unicode font for Cyrillic rendering.
    Falls back to Helvetica if nothing found.
    """
    candidates = [
        ("DejaVuSans", Path("C:/Windows/Fonts/DejaVuSans.ttf")),
        ("Arial", Path("C:/Windows/Fonts/arial.ttf")),
        ("Tahoma", Path("C:/Windows/Fonts/tahoma.ttf")),
    ]
    for font_name, font_path in candidates:
        try:
            if font_path.exists():
                if font_name not in pdfmetrics.getRegisteredFontNames():
                    pdfmetrics.registerFont(TTFont(font_name, str(font_path)))
                return font_name
        except Exception:
            continue
    return "Helvetica"


@dataclass
class ImportResult:
    created: int
    skipped: int
    generated_accounts: list[dict]
    errors: list[str]


def _normalize_username(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9._-]+", "", value)
    return value or "user"


def _unique_username(base: str) -> str:
    username = base
    index = 1
    while User.objects.filter(username=username).exists():
        username = f"{base}{index}"
        index += 1
    return username


def _generate_password(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _cell_text(row: dict, key: str) -> str:
    value = row.get(key)
    return str(value).strip() if value is not None else ""


def build_import_template_xlsx() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "users-import"

    for index, column in enumerate(TEMPLATE_COLUMNS, start=1):
        sheet.cell(row=1, column=index, value=column)

    sample_values = ("Иван", "Иванов", "Иванович", "ivanov@example.com", "+79990000000", "ИС-222б")
    for index, value in enumerate(sample_values, start=1):
        sheet.cell(row=2, column=index, value=value)

    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def build_credentials_pdf(accounts: list[dict], role: str) -> bytes:
    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4)
    width, height = A4
    font_name = _resolve_pdf_font_name()
    font_name_bold = "Helvetica-Bold" if font_name == "Helvetica" else font_name

    y = height - 40
    pdf.setFont(font_name_bold, 13)
    pdf.drawString(40, y, "Generated credentials")
    y -= 18
    pdf.setFont(font_name, 10)
    pdf.drawString(40, y, f"Role: {role}")
    y -= 24

    pdf.setFont(font_name, 9)
    for index, account in enumerate(accounts, start=1):
        needed_space = 9 * 8 + 20
        if y < needed_space:
            pdf.showPage()
            y = height - 40
            pdf.setFont(font_name, 9)

        pdf.setFont(font_name_bold, 9)
        pdf.drawString(40, y, f"{index}. {account.get('last_name', '')} {account.get('first_name', '')} {account.get('middle_name', '')}".strip())
        y -= 12
        pdf.setFont(font_name, 9)
        pdf.drawString(50, y, f"id: {account.get('id', '')}")
        y -= 10
        pdf.drawString(50, y, f"username: {account.get('username', '')}")
        y -= 10
        pdf.drawString(50, y, f"password: {account.get('password', '')}")
        y -= 10
        pdf.drawString(50, y, f"email: {account.get('email', '') or '-'}")
        y -= 10
        pdf.drawString(50, y, f"phone: {account.get('phone', '') or '-'}")
        y -= 10
        pdf.drawString(50, y, f"group_name: {account.get('group_name', '') or '-'}")
        y -= 10
        pdf.drawString(50, y, f"role: {account.get('role', role)}")
        y -= 12
        pdf.line(40, y, width - 40, y)
        y -= 12

    pdf.save()
    return output.getvalue()


@transaction.atomic
def import_users_from_xlsx(file_bytes: bytes, role: str) -> ImportResult:
    if role not in UserRole.values:
        raise ValueError("Unsupported role")

    wb = load_workbook(filename=BytesIO(file_bytes), read_only=True, data_only=True)
    sheet = wb.active
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        raise ValueError("Excel file is empty")

    header = [str(h).strip() if h is not None else "" for h in rows[0]]
    header_map = {column: idx for idx, column in enumerate(header) if column}

    missing = sorted(REQUIRED_COLUMNS - set(header_map.keys()))
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

    created = 0
    skipped = 0
    errors: list[str] = []
    generated_accounts: list[dict] = []

    for row_index, values in enumerate(rows[1:], start=2):
        row_data = {name: values[idx] for name, idx in header_map.items() if idx < len(values)}
        first_name = _cell_text(row_data, "first_name")
        last_name = _cell_text(row_data, "last_name")

        if not first_name or not last_name:
            skipped += 1
            errors.append(f"Row {row_index}: first_name and last_name are required")
            continue

        base = _normalize_username(f"{last_name}.{first_name}")
        username = _unique_username(base)
        password = _generate_password()

        user_data = {
            "username": username,
            "password": password,
            "role": role,
            "first_name": first_name,
            "last_name": last_name,
            "middle_name": _cell_text(row_data, "middle_name"),
            "email": _cell_text(row_data, "email"),
            "phone": _cell_text(row_data, "phone"),
            "group_name": _cell_text(row_data, "group_name"),
        }
        user = User.objects.create_user(**user_data)
        created += 1
        generated_accounts.append(
            {
                "id": user.id,
                "username": user.username,
                "password": password,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "middle_name": user.middle_name,
                "full_name": user.full_name,
                "email": user.email,
                "phone": user.phone,
                "group_name": user.group_name,
                "role": user.role,
            }
        )

    return ImportResult(
        created=created,
        skipped=skipped,
        generated_accounts=generated_accounts,
        errors=errors,
    )
