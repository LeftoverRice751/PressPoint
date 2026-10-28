"""Privileged actions leave a record of who did what, from where (SECURITY.md W7).

Before this, nothing recorded who approved a story onto the campus screen,
who created or removed an account, who locked the kiosk, or how many failed
logins an address had made -- `news.updated_by_id` was the only trace, and it
is overwritten by the next edit. `audit_logs` is append-only from the app's
side: there is no code path that updates or deletes a row.

Recording is best-effort by design: an audit write that fails must not turn an
approval or a kiosk lock into a 500 for the person doing it.
"""

import json
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch

from app.services import AuditLog


class FakeTable:
    def __init__(self):
        self.rows = []

    def new(self):
        return self

    def table(self, name):
        assert name == "audit_logs"
        return self

    def create(self, payload):
        self.rows.append(payload)
        return payload


def _request(user=None, remote="", real_ip="198.51.100.7"):
    request = MagicMock()
    request.user.return_value = user
    request.environ = {"REMOTE_ADDR": remote}
    request.header.side_effect = lambda name: {"X-Real-IP": real_ip}.get(name)
    return request


class RecordTest(TestCase):
    def _record(self, *args, **kwargs):
        table = FakeTable()
        with patch.object(AuditLog, "_builder", lambda: table):
            AuditLog.record(*args, **kwargs)
        return table.rows

    def test_writes_actor_action_target_ip_and_details(self):
        admin = SimpleNamespace(id=7, username="ana")
        rows = self._record(
            "news.approved",
            target_type="news",
            target_id=42,
            details={"title": "Hello"},
            request=_request(admin),
        )
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["actor_id"], 7)
        self.assertEqual(row["actor_username"], "ana")
        self.assertEqual(row["action"], "news.approved")
        self.assertEqual((row["target_type"], row["target_id"]), ("news", "42"))
        self.assertEqual(row["ip"], "198.51.100.7")
        self.assertEqual(json.loads(row["details"]), {"title": "Hello"})

    def test_the_ip_is_the_same_unspoofable_one_the_throttle_uses(self):
        """A direct client cannot write a chosen address into the log either."""
        request = _request(None, remote="10.0.0.42", real_ip="192.0.2.1")
        request.header.side_effect = lambda name: {
            "X-Real-IP": "192.0.2.1",
            "CF-Connecting-IP": "203.0.113.9",
        }.get(name)
        rows = self._record("auth.login.failed", request=request)
        self.assertEqual(rows[0]["ip"], "10.0.0.42")

    def test_a_guest_action_records_no_actor(self):
        rows = self._record("auth.login.failed", details={"username": "x"}, request=_request(None))
        self.assertIsNone(rows[0]["actor_id"])
        self.assertIsNone(rows[0]["actor_username"])

    def test_an_explicit_actor_wins_over_the_request_user(self):
        """Login records the account that just signed in, which request.user()
        does not know about yet."""
        rows = self._record(
            "auth.login.succeeded",
            actor=SimpleNamespace(id=3, username="new"),
            request=_request(None),
        )
        self.assertEqual(rows[0]["actor_id"], 3)

    def test_oversized_details_are_truncated_not_rejected(self):
        rows = self._record("x", details={"blob": "a" * 50_000}, request=_request(None))
        self.assertLessEqual(len(rows[0]["details"]), AuditLog.MAX_DETAILS)

    def test_a_failing_write_never_raises(self):
        broken = MagicMock()
        broken.new.side_effect = RuntimeError("db down")
        with patch.object(AuditLog, "_builder", lambda: broken):
            AuditLog.record("kiosk.locked", request=_request(None))  # must not raise

    def test_there_is_no_update_or_delete_api(self):
        public = {n for n in dir(AuditLog) if not n.startswith("_")}
        self.assertFalse({n for n in public if "delete" in n or "update" in n})


class WiringTest(TestCase):
    """The actions SECURITY.md W7 names actually call record()."""

    def test_kiosk_lock_and_unlock_are_recorded(self):
        from app.controllers.gears.KioskController import KioskController

        with patch("app.controllers.gears.KioskController.AuditLog") as audit, patch(
            "app.controllers.gears.KioskController._pusher_configured", return_value=False
        ):
            KioskController().lock(MagicMock())
            KioskController().unlock(MagicMock())
        actions = [c.args[0] for c in audit.record.call_args_list]
        self.assertEqual(actions, ["kiosk.locked", "kiosk.unlocked"])

    def test_failed_login_is_recorded_with_the_attempted_username(self):
        from app.controllers.auth.LoginController import LoginController

        request = MagicMock()
        request.input.side_effect = lambda key: {"username": "victim", "password": "x"}.get(key)
        with patch("app.controllers.auth.LoginController.User") as user_model, patch(
            "app.controllers.auth.LoginController.AuditLog"
        ) as audit:
            user_model.return_value.attempt.return_value = False
            LoginController().store(request, MagicMock())
        audit.record.assert_called_once()
        self.assertEqual(audit.record.call_args.args[0], "auth.login.failed")
        self.assertEqual(audit.record.call_args.kwargs["details"], {"username": "victim"})

    def test_removing_an_editor_is_recorded(self):
        from app.controllers.gears.UserController import UserController

        editor = MagicMock(id=9, username="ed", role="editor")
        request = MagicMock()
        request.param.return_value = 9
        with patch("app.controllers.gears.UserController.User") as user_model, patch(
            "app.controllers.gears.UserController.AuditLog"
        ) as audit:
            user_model.find.return_value = editor
            UserController().destroy(request, MagicMock())
        audit.record.assert_called_once()
        call = audit.record.call_args
        self.assertEqual(call.args[0], "user.deleted")
        self.assertEqual((call.kwargs["target_type"], call.kwargs["target_id"]), ("user", 9))


class MigrationTest(TestCase):
    """The first run of this migration half-failed on production: a Blueprint
    method that does not exist raised inside `with schema.create(...)`, whose
    exit still ran the CREATE -- leaving a table with no FK, no indexes and a
    NOT NULL created_at with no default. Building it dry catches that here."""

    def test_migration_builds_the_intended_table(self):
        import importlib.util

        from masoniteorm.schema import Schema

        from config.database import DATABASES

        spec = importlib.util.spec_from_file_location(
            "create_audit_logs",
            "databases/migrations/2026_10_18_000100_create_audit_logs_table.py",
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        schema = Schema(connection_details=DATABASES, connection="mysql", dry=True)
        schema.has_table = lambda name: False
        built = []
        real_create = Schema.create

        def create(self, table):
            blueprint = real_create(self, table)
            built.append(blueprint)
            return blueprint

        migration = module.CreateAuditLogsTable.__new__(module.CreateAuditLogsTable)
        migration.schema = schema
        with patch.object(Schema, "create", create):
            migration.up()

        sql = " ".join(built[0].to_sql())
        self.assertIn("`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP", sql)
        self.assertIn("REFERENCES `users`(`id`) ON DELETE SET NULL", sql)
        for column in ("action", "actor_id", "created_at"):
            self.assertIn(f"audit_logs_{column}_index", sql)
