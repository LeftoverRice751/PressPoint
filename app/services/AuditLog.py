"""Who did what, from where: the audit trail for privileged actions.

SECURITY.md W7. Before this, nothing recorded who approved a story onto the
campus screen, who created or removed an account, who locked the kiosk, or how
many failed logins an address had made; `news.updated_by_id` was the only
trace, and the next edit overwrites it.

Rows go to `audit_logs` and are append-only from the app's side -- this module
has no update or delete, and nothing else writes the table. Read it with SQL:

    SELECT created_at, actor_username, action, target_type, target_id, ip, details
    FROM audit_logs ORDER BY id DESC LIMIT 50;

record() is best-effort and never raises: a failed audit write must not turn an
approval or a kiosk lock into a 500 for the person doing it. Failures are
printed so they reach the gunicorn error log.

Action names are dotted, `<subject>.<verb in past tense>`:
    auth.login.succeeded  auth.login.failed  auth.password.reset
    profile.password.changed
    user.created  user.deleted  user.password.reset
    news.approved  news.rejected  issue.approved  issue.rejected
    kiosk.locked  kiosk.unlocked
"""

import json
import traceback

from app.rate_limiters import client_ip

TABLE = "audit_logs"

# details is a TEXT column; anything near this size is a bug, not context.
MAX_DETAILS = 4000


def _builder():
    from wsgi import application

    return application.make("builder")


def _current_request():
    try:
        from wsgi import application

        return application.make("request")
    except Exception:
        return None


def _actor_of(request):
    try:
        user = request.user() if request is not None else None
    except Exception:
        user = None
    return user or None


def record(action, target_type=None, target_id=None, details=None, actor=None, request=None):
    """Append one audit row. Never raises."""
    try:
        if request is None:
            request = _current_request()
        if actor is None:
            actor = _actor_of(request)

        encoded = None
        if details:
            encoded = json.dumps(details, default=str, ensure_ascii=False)
            if len(encoded) > MAX_DETAILS:
                encoded = encoded[: MAX_DETAILS - 1] + "…"

        _builder().new().table(TABLE).create(
            {
                "actor_id": getattr(actor, "id", None) if actor else None,
                "actor_username": getattr(actor, "username", None) if actor else None,
                "action": str(action)[:64],
                "target_type": str(target_type)[:32] if target_type else None,
                "target_id": str(target_id)[:64] if target_id is not None else None,
                "details": encoded,
                "ip": client_ip(request)[:45] if request is not None else None,
            }
        )
    except Exception as exception:
        traceback.print_exception(type(exception), exception, exception.__traceback__)
