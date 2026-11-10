"""The one-off newsletter purge: safe by default, files only after commit.

Doubles only: a recording builder stands in for QueryBuilder, so nothing here
touches the live MySQL that `.env` points at.
"""

import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "purge_newsletters.py"


def _load():
    spec = importlib.util.spec_from_file_location("purge_newsletters", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


purge = _load()


class FakeBuilder:
    """Records every statement and transaction call in one shared event log."""

    def __init__(self, events):
        self.events = events
        self.fail_on = None

    def begin_transaction(self):
        self.events.append(("begin",))

    def commit(self):
        self.events.append(("commit",))

    def rollback(self):
        self.events.append(("rollback",))

    def statement(self, sql, bindings=None):
        self.events.append(("sql", " ".join(sql.split()), list(bindings or [])))
        if self.fail_on and self.fail_on in sql:
            raise RuntimeError("boom")
        text = " ".join(sql.split())
        if text.startswith("SELECT image FROM news WHERE NOT"):
            return []
        if text.startswith("SELECT image FROM news WHERE"):
            return [
                {"image": "news/a.jpg"},
                {"image": "news/b.jpg"},
                {"image": "news/c.jpg"},
            ]
        if text.startswith("SELECT MIN(created_at)"):
            return [{"c": None}]
        if text.startswith("SELECT COUNT(*) AS n FROM news"):
            return [{"n": 2}]
        if text.startswith("SELECT COUNT(*) AS n FROM issue_events"):
            return [{"n": 3}]
        if text.startswith("SELECT COUNT(*) AS n FROM issues"):
            return [{"n": 1}]
        if text.startswith("SELECT COUNT(*) AS n FROM notifications"):
            return [{"n": 4}]
        return []

    def writes(self):
        return [e for e in self.events if e[0] == "sql" and not e[1].startswith("SELECT")]


class PurgeCase(unittest.TestCase):
    def setUp(self):
        self.events = []
        self.builder = FakeBuilder(self.events)
        self.deleted_files = []
        self.on_disk = {"news/a.jpg", "news/b.jpg", "news/c.jpg"}
        self.real_files = patch.object(
            purge, "existing_files", lambda p: [p] if p in self.on_disk else []
        )
        self.real_files.start()
        self.addCleanup(self.real_files.stop)

    def delete_file(self, path):
        self.events.append(("file", path))
        self.deleted_files.append(path)
        self.on_disk.discard(path)

    def run_main(self, argv):
        return purge.main(argv, builder_factory=lambda: self.builder, delete_file=self.delete_file)

    def backup(self, content=b"-- dump"):
        handle = tempfile.NamedTemporaryFile(delete=False)
        handle.write(content)
        handle.close()
        self.addCleanup(os.unlink, handle.name)
        return handle.name


class DryRunTests(PurgeCase):
    def test_dry_run_deletes_nothing(self):
        self.assertEqual(self.run_main([]), 0)
        self.assertEqual(self.builder.writes(), [])
        self.assertEqual(self.deleted_files, [])
        self.assertNotIn(("begin",), self.events)

    def test_dry_run_prints_counts_and_the_rule(self):
        with patch("builtins.print") as printed:
            self.run_main([])
        out = "\n".join(str(c.args[0]) for c in printed.call_args_list if c.args)
        self.assertIn(purge.LEGACY_RULE, out)
        self.assertIn("(reworked): 2", out)
        for needle in ("news rows: 2", "issues: 1", "issue_events: 3", "notifications: 4"):
            self.assertIn(needle, out)
        self.assertIn("image files: 3", out)
        self.assertNotIn("logo", out)


class ConfirmGuardTests(PurgeCase):
    def test_confirm_without_backup_exits_nonzero_and_touches_nothing(self):
        self.assertNotEqual(self.run_main(["--confirm"]), 0)
        self.assertEqual(self.events, [])

    def test_missing_backup_file_refuses(self):
        self.assertNotEqual(self.run_main(["--confirm", "--backup", "/nope/x.sql"]), 0)
        self.assertEqual(self.events, [])

    def test_empty_backup_file_refuses(self):
        path = self.backup(b"")
        self.assertNotEqual(self.run_main(["--confirm", "--backup", path]), 0)
        self.assertEqual(self.events, [])


class LegacyRuleTests(PurgeCase):
    def test_rule_excludes_rows_with_image_crop_or_expiry(self):
        rule = purge.LEGACY_WHERE
        self.assertIn("expires_at IS NULL", rule)
        self.assertIn("image_crop IS NULL", rule)
        self.assertIn("source_lines IS NULL", rule)
        self.assertIn("issue_id IS NOT NULL", rule)

    def test_every_news_statement_uses_the_rule(self):
        self.run_main(["--confirm", "--backup", self.backup()])
        news_deletes = [e for e in self.builder.writes() if e[1].startswith("DELETE FROM news ")]
        self.assertEqual(len(news_deletes), 1)
        self.assertIn(purge.LEGACY_WHERE, news_deletes[0][1])


class ConfirmTests(PurgeCase):
    def test_deletes_in_fk_order_inside_one_transaction(self):
        self.run_main(["--confirm", "--backup", self.backup()])
        tables = [e[1].split()[2] for e in self.builder.writes() if e[1].startswith("DELETE FROM")]
        self.assertEqual(tables, ["issue_events", "notifications", "news", "issues"])
        self.assertEqual(self.events.count(("begin",)), 1)
        self.assertEqual(self.events.count(("commit",)), 1)

    def test_files_are_deleted_only_after_commit(self):
        self.run_main(["--confirm", "--backup", self.backup()])
        commit = self.events.index(("commit",))
        files = [i for i, e in enumerate(self.events) if e[0] == "file"]
        self.assertEqual(len(files), 3)
        self.assertTrue(all(i > commit for i in files))

    def test_failed_transaction_rolls_back_and_deletes_no_files(self):
        self.builder.fail_on = "DELETE FROM news "
        self.assertNotEqual(self.run_main(["--confirm", "--backup", self.backup()]), 0)
        self.assertIn(("rollback",), self.events)
        self.assertNotIn(("commit",), self.events)
        self.assertEqual(self.deleted_files, [])

    def test_file_delete_failure_is_counted_not_raised(self):
        def flaky(path):
            # Like delete_image_and_variants: swallows the OSError, file stays.
            if path == "news/a.jpg":
                return
            self.deleted_files.append(path)
            self.on_disk.discard(path)

        with patch("builtins.print") as printed:
            code = purge.main(
                ["--confirm", "--backup", self.backup()],
                builder_factory=lambda: self.builder,
                delete_file=flaky,
            )
        self.assertEqual(code, 0)
        self.assertEqual(sorted(self.deleted_files), ["news/b.jpg", "news/c.jpg"])
        out = "\n".join(str(c.args[0]) for c in printed.call_args_list if c.args)
        self.assertIn("2 file path(s) removed, 1 file delete(s) failed", out)


class NotificationRuleTests(PurgeCase):
    def test_only_news_decision_types_are_deleted(self):
        self.run_main(["--confirm", "--backup", self.backup()])
        sql = [e for e in self.builder.writes() if "FROM notifications" in e[1]][0]
        self.assertIn("'news.approved'", sql[1])
        self.assertIn("'news.rejected'", sql[1])


if __name__ == "__main__":
    unittest.main()


class OneConnectionTests(unittest.TestCase):
    """masonite-orm closes the connection after any query made outside a
    transaction (MySQLConnection.query, finally branch) and nulls _connection.
    Drive the real QueryBuilder over a fake pymysql to prove the purge's
    BEGIN, DELETEs and COMMIT share one live connection."""

    def test_begin_deletes_and_commit_share_one_connection(self):
        from unittest.mock import MagicMock

        created = []

        def fake_connect(**kwargs):
            conn = MagicMock(name=f"conn{len(created)}")
            conn.cursor.return_value.fetchall.return_value = []
            created.append(conn)
            return conn

        counts = {"notification_where": ("type IN ('news.approved')", [])}
        with patch("pymysql.connect", side_effect=fake_connect):
            builder = purge._builder()
            # plan()-style read first: closes that builder's connection, as in prod.
            builder.statement("SELECT COUNT(*) AS n FROM issues")
            fresh = purge._builder()
            purge.purge(fresh, counts)

        conn = created[-1]
        names = [c[0] for c in conn.method_calls]
        self.assertEqual(names[0], "begin")
        self.assertEqual(names[-1], "commit")
        executed = [
            " ".join(str(c.args[0]).split())
            for c in conn.cursor.return_value.execute.call_args_list
        ]
        tables = [q.split()[2] for q in executed if q.startswith("DELETE FROM")]
        self.assertEqual(tables, ["issue_events", "notifications", "news", "issues"])
        self.assertEqual(len(created), 2)  # one for the read, one for the purge
        conn.rollback.assert_not_called()
