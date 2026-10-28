"""Locking the public screen tells every admin (SECURITY.md W11).

Kiosk Lock lives in the *editor* dashboard and stays there: editors are the
ones standing next to the terminal. But it blanks the campus screen, and
until the audit log nothing even recorded who pressed it. Now each lock and
unlock is audited (W7) and also lands in every admin's notification bell, so
a lock cannot sit unnoticed until someone walks past the hallway.
"""

from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch

from app.controllers.gears.KioskController import KioskController

ADMINS = [
    SimpleNamespace(id=1, username="ana", role="admin"),
    SimpleNamespace(id=2, username="ben", role=" Admin "),  # live column has stray casing
    SimpleNamespace(id=3, username="eli", role="editor"),
    SimpleNamespace(id=4, username="sam", role="superadmin"),
]


def _run(action, actor):
    request = MagicMock()
    request.user.return_value = actor
    with patch("app.controllers.gears.KioskController._pusher_configured", return_value=False), patch(
        "app.controllers.gears.KioskController.AuditLog"
    ), patch("app.controllers.gears.KioskController.User") as users, patch(
        "app.controllers.gears.KioskController.Notifications"
    ) as notes, patch(
        "app.controllers.gears.KioskController._current_request", return_value=request
    ):
        users.all.return_value = ADMINS
        getattr(KioskController(), action)(MagicMock())
    return notes.notify.call_args_list


class KioskLockAlertTest(TestCase):
    def test_a_lock_notifies_every_admin_and_names_who_did_it(self):
        calls = _run("lock", SimpleNamespace(id=3, username="eli", full_name="Eli Cruz"))
        self.assertEqual(sorted(c.args[0] for c in calls), [1, 2])
        for call in calls:
            self.assertEqual(call.args[1], "kiosk.locked")
            self.assertIn("Eli Cruz", call.args[2])

    def test_an_unlock_is_announced_too(self):
        calls = _run("unlock", SimpleNamespace(id=3, username="eli", full_name=None))
        self.assertEqual({c.args[1] for c in calls}, {"kiosk.unlocked"})
        self.assertIn("eli", calls[0].args[2])

    def test_the_admin_who_pressed_it_is_not_notified_of_their_own_action(self):
        calls = _run("lock", SimpleNamespace(id=1, username="ana", full_name=None))
        self.assertEqual([c.args[0] for c in calls], [2])

    def test_a_failing_lookup_never_breaks_the_lock(self):
        request = MagicMock()
        with patch("app.controllers.gears.KioskController._pusher_configured", return_value=False), patch(
            "app.controllers.gears.KioskController.AuditLog"
        ), patch("app.controllers.gears.KioskController.User") as users, patch(
            "app.controllers.gears.KioskController._current_request", return_value=request
        ):
            users.all.side_effect = RuntimeError("db down")
            response = MagicMock()
            KioskController().lock(response)
        response.json.assert_called_once()
        self.assertTrue(response.json.call_args.args[0]["ok"])
