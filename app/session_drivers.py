"""Slot-aware session storage.

The session driver here is the cookie one (config/session.py), so there is no
server-side session store at all: every key is its own cookie, `s_<key>` for
persistent values and `f_<key>` for flashes. Those cookies are shared by every
tab of the origin, which means a flash set by an admin's action popped up in
the editor's tab, and the password-reset keys were shared too.

Prefixing each key with the request's slot gives every tab its own bag. Slot 0
keeps the bare `s_`/`f_` names so an in-flight session survives the deploy.
"""

from masonite.drivers.session import CookieDriver

from app.tab_slots import normalize_slot


def _prefix(slot: int) -> str:
    slot = normalize_slot(slot)
    return "" if slot == 0 else f"u{slot}_"


class SlotCookieSessionDriver(CookieDriver):
    """CookieDriver that namespaces every session cookie by tab slot."""

    def _slot_prefix(self) -> str:
        return _prefix(getattr(self.get_request(), "tab_slot", 0))

    def start(self) -> dict:
        prefix = self._slot_prefix()
        data = {}
        flashed = {}

        for key, value in self.get_request().cookie_jar.to_dict().items():
            # str.removeprefix, not upstream's key.replace("s_", ""): replace
            # strips that substring *anywhere* in the name, so a key like
            # "reports_" came back mangled. Only a real leading match counts.
            if key.startswith("s_"):
                bag, name = data, key[2:]
            elif key.startswith("f_"):
                bag, name = flashed, key[2:]
            else:
                continue

            # A slot only ever sees its own keys. Without this check slot 1
            # would read slot 0's flashes as well as its own.
            if prefix:
                if not name.startswith(prefix):
                    continue
                name = name[len(prefix):]
            elif _is_slotted(name):
                continue

            bag[name] = value

        return {"data": data, "flashed": flashed}

    def save(self, added=None, deleted=None, flashed=None, deleted_flashed=None) -> None:
        prefix = self._slot_prefix()
        response = self.get_response()

        for key, value in (added or {}).items():
            response.cookie(f"s_{prefix}{key}", value)

        for key, value in (flashed or {}).items():
            response.cookie(f"f_{prefix}{key}", value)

        for key in deleted or []:
            response.delete_cookie(f"s_{prefix}{key}")

        for key in deleted_flashed or []:
            response.delete_cookie(f"f_{prefix}{key}")


def _is_slotted(name: str) -> bool:
    """True when `name` carries another slot's prefix (`u1_`...`u9_`)."""
    return len(name) > 3 and name[0] == "u" and name[1].isdigit() and name[2] == "_"
