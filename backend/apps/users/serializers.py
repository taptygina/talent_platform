from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password

from apps.users.models import User


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

    def validate_new_password(self, value):
        if not value:
            return value
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
