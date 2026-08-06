"""Shared SaaSTool -> dict conversion, used by both scan_pipeline.py's
sequential assessment path and tasks.py's Celery-dispatched path — split
into its own module so neither has to import the other."""

from app.models import SaaSTool


def tool_to_dict(t: SaaSTool) -> dict:
    return {
        "id": t.id, "tool_name": t.tool_name, "vendor": t.vendor, "category": t.category,
        "connected_via": t.connected_via, "department": t.department, "connected_by_role": t.connected_by_role,
        "first_connected": t.first_connected, "last_used": t.last_used,
        "monthly_active_users": t.monthly_active_users, "oauth_scopes": t.oauth_scopes,
        "data_categories_accessed": t.data_categories_accessed, "hosting_region": t.hosting_region,
        "source": t.source, "remediated": t.remediated,
    }
