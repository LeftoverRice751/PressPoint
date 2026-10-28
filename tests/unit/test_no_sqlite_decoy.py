"""No sqlite anywhere the app could be pointed at by mistake (SECURITY.md W12).

The app has only ever run on MySQL, but three leftovers kept a second database
one setting away: an empty `masonite.sqlite3` at the repo root, a `sqlite`
connection in config/database.py, and `.env.testing`, whose only content was
DB_CONNECTION=sqlite. Setting APP_ENV=testing therefore sent the whole suite --
or a misconfigured server -- at an empty file and every query "worked" against
nothing. config/notification.py and config/queue.py also named that connection.

With the connection gone, the same mistake fails loudly instead.
"""

import pathlib
from unittest import TestCase

ROOT = pathlib.Path(__file__).resolve().parents[2]


class NoSqliteDecoyTest(TestCase):
    def test_the_decoy_files_are_gone(self):
        self.assertFalse((ROOT / "masonite.sqlite3").exists())
        self.assertFalse((ROOT / ".env.testing").exists())

    def test_there_is_no_sqlite_connection_to_select(self):
        from config.database import DATABASES

        self.assertNotIn("sqlite", DATABASES)
        drivers = {v.get("driver") for v in DATABASES.values() if isinstance(v, dict)}
        self.assertNotIn("sqlite", drivers)

    def test_framework_database_drivers_name_the_real_connection(self):
        from config import notification, queue

        self.assertEqual(notification.DRIVERS["database"]["connection"], "mysql")
        self.assertEqual(queue.DRIVERS["database"]["connection"], "mysql")
