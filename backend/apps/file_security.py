import os
import uuid
import zipfile
from dataclasses import dataclass
from io import BytesIO

from django.core.files.uploadedfile import UploadedFile
from django.utils.text import get_valid_filename
from PIL import Image, UnidentifiedImageError


class FileValidationError(ValueError):
    pass


@dataclass(frozen=True)
class UploadPolicy:
    allowed_extensions: set[str]
    max_size_bytes: int
    allow_images: bool = False
    allow_office: bool = False
    allow_pdf: bool = False
    allow_text: bool = False
    allow_zip: bool = False


def sanitize_filename(filename: str, *, default_stem: str = "file") -> str:
    base = os.path.basename(filename or "")
    stem, ext = os.path.splitext(base)
    cleaned_stem = get_valid_filename(stem) or default_stem
    cleaned_stem = cleaned_stem[:80]
    ext = (ext or "").lower()[:10]
    return f"{cleaned_stem}-{uuid.uuid4().hex[:10]}{ext}"


def _read_head(uploaded: UploadedFile, size: int = 8192) -> bytes:
    pos = uploaded.tell()
    uploaded.seek(0)
    head = uploaded.read(size)
    uploaded.seek(pos)
    return head


def _is_image(uploaded: UploadedFile) -> bool:
    pos = uploaded.tell()
    uploaded.seek(0)
    try:
        with Image.open(uploaded) as image:
            image.verify()
        return True
    except (UnidentifiedImageError, OSError):
        return False
    finally:
        uploaded.seek(pos)


def _is_pdf(head: bytes) -> bool:
    return head.startswith(b"%PDF-")


def _is_zip(head: bytes) -> bool:
    return head.startswith(b"PK\x03\x04") or head.startswith(b"PK\x05\x06") or head.startswith(b"PK\x07\x08")


def _is_office_openxml(uploaded: UploadedFile, expected_ext: str) -> bool:
    pos = uploaded.tell()
    uploaded.seek(0)
    try:
        with zipfile.ZipFile(uploaded) as archive:
            names = set(archive.namelist())
            if "[Content_Types].xml" not in names:
                return False
            if expected_ext == ".docx":
                return "word/document.xml" in names
            if expected_ext == ".xlsx":
                return "xl/workbook.xml" in names
            if expected_ext == ".pptx":
                return "ppt/presentation.xml" in names
        return False
    except zipfile.BadZipFile:
        return False
    finally:
        uploaded.seek(pos)


def _looks_like_text(head: bytes) -> bool:
    if b"\x00" in head:
        return False
    try:
        head.decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False


def validate_uploaded_file(uploaded: UploadedFile, *, policy: UploadPolicy) -> str:
    ext = os.path.splitext(uploaded.name or "")[1].lower()
    if ext not in policy.allowed_extensions:
        raise FileValidationError("Недопустимое расширение файла.")

    if uploaded.size > policy.max_size_bytes:
        raise FileValidationError("Размер файла превышает допустимый лимит.")

    head = _read_head(uploaded)

    if policy.allow_images and ext in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        if not _is_image(uploaded):
            raise FileValidationError("Файл не является корректным изображением.")
        return ext

    if policy.allow_pdf and ext == ".pdf":
        if not _is_pdf(head):
            raise FileValidationError("Файл .pdf поврежден или имеет неверный формат.")
        return ext

    if policy.allow_office and ext in {".docx", ".xlsx", ".pptx"}:
        if not _is_zip(head) or not _is_office_openxml(uploaded, ext):
            raise FileValidationError("Файл Office OpenXML поврежден или не соответствует расширению.")
        return ext

    if policy.allow_zip and ext == ".zip":
        if not _is_zip(head):
            raise FileValidationError("Файл .zip поврежден или не соответствует расширению.")
        return ext

    if policy.allow_text and ext in {".txt", ".md", ".csv", ".json"}:
        if not _looks_like_text(head):
            raise FileValidationError("Текстовый файл поврежден или имеет неверный формат.")
        return ext

    raise FileValidationError("Тип файла не поддерживается.")
