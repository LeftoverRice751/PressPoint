"""Per-tab sign-in slots.

Authentication in this app is a single cookie: LoginController writes
`token = users.remember_token` and the current user is whoever that token
resolves to. Cookies are per-*origin*, never per-tab, so a second sign-in in
another tab of the same browser overwrote that one cookie and silently took
over the first tab -- refreshing an editor's dashboard landed on the admin
console because DashboardController.show() bounces admins to /users.

The fix is not "a cookie per tab" (the browser cannot do that). It is several
identity cookies at once, with each tab choosing which one applies via a `u=N`
selector carried in its own URL -- the model behind Google's /u/0/, /u/1/.
The URL is what makes it survive a reload, because a reload replays the URL.

Slot 0 deliberately keeps today's bare cookie names (`token`, `s_x`, `f_x`) so
deploying this does not sign out everyone who is already logged in, and so the
unauthenticated login and password-reset flows are byte-for-byte unchanged.
"""

MAX_SLOTS = 4

#: Query parameter and request header a tab uses to name its slot. The query
#: parameter carries page navigations and redirects (it survives a reload);
#: the header carries AJAX, so dashboard-live.js and the upload meter did not
#: have to be rewritten to append a parameter to every fetch URL.
SLOT_PARAM = "u"
SLOT_HEADER = "X-Tab-Slot"


def normalize_slot(value) -> int:
    """Coerce anything to a valid slot, failing closed to 0.

    Fails closed on purpose: an unparseable or out-of-range `u=` must land on
    the default slot rather than raise, because this runs in HTTP middleware on
    every request including the public kiosk's.
    """
    try:
        slot = int(str(value).strip())
    except (TypeError, ValueError):
        return 0
    if slot < 0 or slot >= MAX_SLOTS:
        return 0
    return slot


def slot_cookie(name: str, slot: int) -> str:
    """The cookie name `name` takes in `slot`.

    The single source of truth for slotted cookie naming -- imported by the
    middleware, the session driver and LoginController so the three can never
    disagree about where a slot's token lives.
    """
    slot = normalize_slot(slot)
    return name if slot == 0 else f"{name}_{slot}"


def request_slot(request) -> int:
    """The slot this request belongs to.

    Query parameter first, then the header. Read straight off QUERY_STRING
    rather than through `request.input()`, which also reads the POST body -- a
    form field happening to be named "u" must not be able to switch identity.
    """
    from urllib.parse import parse_qs

    query = parse_qs(request.environ.get("QUERY_STRING", "") or "")
    if query.get(SLOT_PARAM):
        return normalize_slot(query[SLOT_PARAM][0])

    header = request.header(SLOT_HEADER)
    if header:
        return normalize_slot(header)

    return 0


def stamp_url(url: str, slot: int) -> str:
    """Append `u=<slot>` to `url` unless it is slot 0 or already carries one."""
    slot = normalize_slot(slot)
    if slot == 0 or not url:
        return url

    from urllib.parse import parse_qs, urlsplit

    parts = urlsplit(url)
    if SLOT_PARAM in parse_qs(parts.query):
        return url

    return url + ("&" if parts.query else "?") + f"{SLOT_PARAM}={slot}"


def current_slot() -> int:
    """This request's slot, for templates (shared into views by AppProvider).

    Resolves through the container rather than taking the request as an
    argument because Jinja calls it with none. Returns 0 outside a request --
    e.g. the unit tests that render dashboard templates directly.
    """
    from masonite.facades import Request

    try:
        return normalize_slot(getattr(Request, "tab_slot", 0))
    except Exception:
        return 0


def allocate_slot(request, user_lookup) -> int:
    """Pick the slot a fresh sign-in should occupy.

    The lowest slot that is empty or whose token no longer resolves to a user;
    if every slot is live, slot 0 is reused (the oldest tab loses its sign-in,
    which is exactly today's behaviour and the least surprising fallback).

    `user_lookup` takes a token and returns a user or a falsy value -- passed
    in so this module stays free of a model import.
    """
    for slot in range(MAX_SLOTS):
        token = request.cookie(slot_cookie("token", slot))
        if not token or not user_lookup(token):
            return slot
    return 0


def clear_slot_session(request, response, slot) -> None:
    """Delete every session cookie belonging to `slot`.

    Signing out of one tab must not empty another tab's flash bag, so this
    walks the jar and drops only the names carrying this slot's prefix.
    """
    slot = normalize_slot(slot)
    prefix = "" if slot == 0 else f"u{slot}_"

    for key in list(request.cookie_jar.to_dict().keys()):
        if not (key.startswith("s_") or key.startswith("f_")):
            continue
        name = key[2:]
        if prefix:
            if name.startswith(prefix):
                response.delete_cookie(key)
        elif not _looks_slotted(name):
            response.delete_cookie(key)


def _looks_slotted(name: str) -> bool:
    return len(name) > 3 and name[0] == "u" and name[1].isdigit() and name[2] == "_"
