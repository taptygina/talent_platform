import django_filters

from apps.projects.models import Project


class ProjectFilter(django_filters.FilterSet):
    start_date_from = django_filters.DateFilter(field_name="start_date", lookup_expr="gte")
    start_date_to = django_filters.DateFilter(field_name="start_date", lookup_expr="lte")
    end_date_from = django_filters.DateFilter(field_name="end_date", lookup_expr="gte")
    end_date_to = django_filters.DateFilter(field_name="end_date", lookup_expr="lte")

    class Meta:
        model = Project
        fields = (
            "type",
            "status",
            "supervisor",
            "team",
            "is_published",
            "is_archived",
            "start_date_from",
            "start_date_to",
            "end_date_from",
            "end_date_to",
        )
