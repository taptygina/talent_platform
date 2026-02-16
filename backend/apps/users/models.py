from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class UserRole(models.TextChoices):
    STUDENT = "student", "Студент"
    TEACHER = "teacher", "Преподаватель"
    METHODIST = "methodist", "Методист"
    CURATOR = "curator", "Куратор"
    ADMIN = "admin", "Администратор"


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, username: str, password: str, **extra_fields):
        if not username:
            raise ValueError("Username is required")
        user = self.model(username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, username: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(username, password, **extra_fields)

    def create_superuser(self, username: str, password: str, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", UserRole.ADMIN)
        return self._create_user(username, password, **extra_fields)


class User(AbstractUser):
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.STUDENT)
    middle_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    group_name = models.CharField(max_length=100, blank=True)
    avatar_url = models.URLField(blank=True)
    is_verified = models.BooleanField(default=True)

    objects = UserManager()

    class Meta:
        verbose_name = "Пользователь"
        verbose_name_plural = "Пользователи"

    @property
    def full_name(self) -> str:
        return " ".join([self.last_name, self.first_name, self.middle_name]).strip()
