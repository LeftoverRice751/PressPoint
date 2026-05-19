"""Helpers for returning AJAX-friendly JSON from controllers that
otherwise redirect-with-flash. Keeps the dashboard upload meter happy
while preserving the existing graceful-degradation path."""


def wants_json(request):
    """True when the caller is doing an AJAX/JSON request.

    Checks X-Requested-With under common casings AND falls back to
    Accept: application/json. Masonite's request.header() can return
    None when the casing doesn't match what the WSGI layer stored,
    so we try the obvious variants before giving up.
    """
    requested = (
        request.header("X-Requested-With")
        or request.header("x-requested-with")
        or request.header("HTTP_X_REQUESTED_WITH")
        or ""
    )
    if requested.lower() == "xmlhttprequest":
        return True

    accept = (
        request.header("Accept")
        or request.header("accept")
        or request.header("HTTP_ACCEPT")
        or ""
    )
    return "application/json" in accept.lower()


def json_success(response, payload=None, messages=None, status=200):
    body = dict(payload or {})
    body.setdefault("ok", True)
    if messages is not None:
        body["messages"] = list(messages)
    return response.json(body, status=status)


def json_errors(response, errors, status=422):
    if isinstance(errors, str):
        errors = [errors]
    return response.json({"ok": False, "errors": list(errors)}, status=status)
