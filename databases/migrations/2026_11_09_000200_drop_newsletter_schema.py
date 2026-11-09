"""DropNewsletterSchema Migration.

Final step of replacing the newsletter with single photo posts. Drops the
tables and columns only the newsletter used: issue_events, issues,
news_categories, and news.issue_id / layout_type / priority / category_id.

RUN ONLY AFTER scripts/purge_newsletters.py --confirm. The purge reads
news.issue_id to tell legacy rows from real photo posts, and this migration
destroys that column, the issues and the categories for good. Take the
mysqldump first.

Order matters. news carries FKs into issues and news_categories, so the FKs
(and the key each one created) go before the parents, and issue_events goes
before issues. Every step is guarded so a half-run migration can be rerun.
Raw ALTERs for the FK drops: masonite's drop_foreign has not been exercised on
this schema (same hazard as 2026_11_09_000100).

down() recreates structure only, matching databases/schema.sql. No data comes
back; category_id is nullable (it was relaxed in 000100).
"""

from masoniteorm.migrations import Migration
from masoniteorm.query import QueryBuilder

NEWS_COLUMNS = (
    # (column, foreign key name, index name) -- None when the column has none.
    ("issue_id", "news_issue_id_foreign", "news_issue_id_index"),
    ("category_id", "news_category_id_foreign", "news_category_id_foreign"),
    ("layout_type", None, None),
    ("priority", None, None),
)


class DropNewsletterSchema(Migration):
    def _query(self):
        return QueryBuilder(connection=self.schema.connection)

    def _has_foreign_key(self, table, name):
        rows = self._query().statement(
            "SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS "
            "WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = %s "
            "AND CONSTRAINT_NAME = %s AND CONSTRAINT_TYPE = 'FOREIGN KEY'",
            [table, name],
        )
        return bool(rows) and int(rows[0]["n"]) > 0

    def up(self):
        """
        Run the migrations.
        """
        if self.schema.has_table("news"):
            for _column, foreign, _index in NEWS_COLUMNS:
                if foreign and self._has_foreign_key("news", foreign):
                    self._query().statement(f"ALTER TABLE news DROP FOREIGN KEY {foreign}")
            for column, _foreign, _index in NEWS_COLUMNS:
                if self.schema.has_column("news", column):
                    # Dropping the column takes a single-column index with it.
                    self._query().statement(f"ALTER TABLE news DROP COLUMN {column}")

        # issue_events first: it holds the FK into issues.
        for table in ("issue_events", "issues", "news_categories"):
            if self.schema.has_table(table):
                self.schema.drop(table)

    def down(self):
        """
        Revert the migrations (structure only, per databases/schema.sql).
        """
        if not self.schema.has_table("news_categories"):
            self._query().statement(
                "CREATE TABLE news_categories ("
                "id INT UNSIGNED NOT NULL AUTO_INCREMENT, "
                "name VARCHAR(80) NOT NULL, name_key VARCHAR(80) NOT NULL, "
                "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                "deleted_at DATETIME NULL, "
                "PRIMARY KEY (id), UNIQUE KEY news_categories_name_key_unique (name_key)"
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            )
        if not self.schema.has_table("issues"):
            self._query().statement(
                "CREATE TABLE issues ("
                "id INT UNSIGNED NOT NULL AUTO_INCREMENT, number INT UNSIGNED NOT NULL, "
                "owner_id INT UNSIGNED NULL, title VARCHAR(255) NULL, "
                "published_at DATETIME NULL, "
                "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, deleted_at DATETIME NULL, "
                "PRIMARY KEY (id), KEY issues_owner_id_index (owner_id), "
                "CONSTRAINT issues_owner_id_foreign FOREIGN KEY (owner_id) "
                "REFERENCES users (id) ON DELETE SET NULL"
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            )
        if not self.schema.has_table("issue_events"):
            self._query().statement(
                "CREATE TABLE issue_events ("
                "id INT UNSIGNED NOT NULL AUTO_INCREMENT, "
                "issue_id INT UNSIGNED NOT NULL, event_id INT UNSIGNED NOT NULL, "
                "created_at DATETIME NULL, updated_at DATETIME NULL, "
                "PRIMARY KEY (id), "
                "UNIQUE KEY issue_events_issue_id_event_id_unique (issue_id, event_id), "
                "CONSTRAINT issue_events_issue_id_foreign FOREIGN KEY (issue_id) "
                "REFERENCES issues (id) ON DELETE CASCADE, "
                "CONSTRAINT issue_events_event_id_foreign FOREIGN KEY (event_id) "
                "REFERENCES events (id) ON DELETE CASCADE"
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            )

        if not self.schema.has_table("news"):
            return
        adds = {
            "category_id": "ADD COLUMN category_id INT UNSIGNED NULL",
            "layout_type": "ADD COLUMN layout_type VARCHAR(255) NOT NULL DEFAULT 'brief'",
            "priority": "ADD COLUMN priority INT NOT NULL DEFAULT 0",
            "issue_id": "ADD COLUMN issue_id INT UNSIGNED NULL",
        }
        for column, clause in adds.items():
            if not self.schema.has_column("news", column):
                self._query().statement(f"ALTER TABLE news {clause}")
        if not self._has_foreign_key("news", "news_category_id_foreign"):
            self._query().statement(
                "ALTER TABLE news ADD CONSTRAINT news_category_id_foreign "
                "FOREIGN KEY (category_id) REFERENCES news_categories (id) ON DELETE RESTRICT"
            )
        if not self._has_foreign_key("news", "news_issue_id_foreign"):
            self._query().statement(
                "ALTER TABLE news ADD INDEX news_issue_id_index (issue_id), "
                "ADD CONSTRAINT news_issue_id_foreign FOREIGN KEY (issue_id) "
                "REFERENCES issues (id) ON DELETE SET NULL"
            )
