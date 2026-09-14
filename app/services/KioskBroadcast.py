"""Tell the kiosk a section changed, so it re-fetches without a reload.

One function matters: section_changed(section_id). It is best-effort in the
same way every other broadcast in this app is (KioskController.lock,
VideoController._broadcast_play_video): it checks the Pusher config, it
swallows every exception, and it returns whether the message went out. A
failed broadcast must never fail, block or slow an editor's save -- the
kiosk degrades to the service worker's stale-while-revalidate freshness,
which is exactly what it had before this existed.

The payload is {"section", "stamp"} and nothing else. The kiosk re-fetches
on receipt, so nothing editorial ever rides the (public) channel, and a
duplicated or reordered event is at worst a redundant re-fetch.

`stamp` is a server millisecond timestamp rather than the dashboard's
count:max(updated_at) marker: updated_at has one-second resolution and does
not move on a delete, so the kiosk would drop the second of two same-second
saves -- or a delete -- as "not newer". Time only ever moves forward.

`pusher_configured()` is the single definition of the predicate that used
to be copy-pasted into four controllers; they import it as
`_pusher_configured` so their tests keep patching the same name.
"""

import time

from masonite.configuration import config
from masonite.facades import Broadcast

CHANNEL = "kiosk-content"
EVENT = "app.events.KioskSectionChanged"

#: The kiosk sections that have a live-update path. Must match the ids in
#: KioskSections and the section map in resources/js/sw-kiosk.js.
SECTIONS = ("latest-news", "about-lspu", "gears-archive")


def pusher_configured():
    broadcasts = config("broadcast.broadcasts", {}) or config("broadcast.BROADCASTS", {}) or {}
    pusher_settings = broadcasts.get("pusher") or {}
    return bool(
        (pusher_settings.get("client") or pusher_settings.get("key"))
        and pusher_settings.get("app_id")
        and pusher_settings.get("secret")
    )


def _deliver(payload):
    """The one line that touches the network. Tests patch this."""
    Broadcast.channel([CHANNEL], EVENT, payload)


def section_changed(section_id):
    """Broadcast that `section_id` changed. Returns True if it went out."""
    if section_id not in SECTIONS:
        return False
    if not pusher_configured():
        return False
    try:
        _deliver({"section": section_id, "stamp": int(time.time() * 1000)})
        return True
    except Exception:
        return False
