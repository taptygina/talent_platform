from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.users.models import SystemSetting, User

USERNAME_MIN_LEN = 3
USERNAME_MAX_LEN = 5
PASSWORD_MIN_LEN = 8


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "middle_name",
            "full_name",
            "email",
            "phone",
            "group_name",
            "avatar_url",
            "role",
        )


class UserManageSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    new_password = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "middle_name",
            "full_name",
            "email",
            "phone",
            "group_name",
            "avatar_url",
            "role",
            "is_active",
            "is_verified",
            "new_password",
            "date_joined",
            "last_login",
        )
        read_only_fields = ("date_joined", "last_login")

    def validate_username(self, value):
        length = len((value or "").strip())
        if length < USERNAME_MIN_LEN or length > USERNAME_MAX_LEN:
            raise serializers.ValidationError("Логин должен содержать от 3 до 5 символов.")
        return value

    def validate_new_password(self, value):
        if not value:
            return value
        if len(value) < PASSWORD_MIN_LEN:
            raise serializers.ValidationError("Пароль должен содержать минимум 8 символов.")
        validate_password(value)
        return value

    def update(self, instance, validated_data):
        new_password = validated_data.pop("new_password", "")
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if new_password:
            instance.set_password(new_password)
        instance.save()
        return instance


class SelfProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    new_password = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "middle_name",
            "full_name",
            "email",
            "phone",
            "group_name",
            "avatar_url",
            "role",
            "new_password",
        )
        read_only_fields = ("role",)

    def validate_username(self, value):
        length = len((value or "").strip())
        if length < USERNAME_MIN_LEN or length > USERNAME_MAX_LEN:
            raise serializers.ValidationError("Логин должен содержать от 3 до 5 символов.")
        return value

    def validate_new_password(self, value):
        if not value:
            return value
        if len(value) < PASSWORD_MIN_LEN:
            raise serializers.ValidationError("Пароль должен содержать минимум 8 символов.")
        validate_password(value)
        return value

    def update(self, instance, validated_data):
        new_password = validated_data.pop("new_password", "")
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if new_password:
            instance.set_password(new_password)
        instance.save()
        return instance


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = (
            "id",
            "platform_name",
            "max_team_members",
            "upcoming_deadline_days",
            "allow_public_feed",
            "updated_at",
        )
        read_only_fields = ("id", "updated_at")
