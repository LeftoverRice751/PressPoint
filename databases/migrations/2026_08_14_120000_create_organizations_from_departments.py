"""CreateOrganizationsFromDepartments Migration.

Turns the location-derived `departments` table into the editor-owned
`organizations` table, and re-points `members` at it.

`departments` was a shadow of `locations`: a UNIQUE `location_id` FK, rows
auto-created from every Department-type location on each dashboard render, and
every view filtering out anything that didn't resolve back to such a location.
That made an editor-created row invisible, so organizations could not be
managed at all. This drops the locations tie and adds `kind` so a student
organization and an academic department can live in the same table.

The table is *renamed* rather than recreated, so all existing rows keep their
ids and `members.department_id` values stay valid through the change.

Raw SQL is used for the foreign-key and column-rename steps: Masonite ORM's
schema builder cannot drop a foreign key by its constraint name, and cannot
rename a column that a foreign key still points at.
"""

from masoniteorm.migrations import Migration


KIND_COLUMN_SQL = (
    "ALTER TABLE `organizations` "
    "ADD COLUMN `kind` VARCHAR(32) NOT NULL DEFAULT 'department' AFTER `name`"
)


class CreateOrganizationsFromDepartments(Migration):
    def _run(self, statements):
        """Execute raw statements in order on one connection."""
        connection = self.schema.new_connection()
        for statement in statements:
            connection.query(statement, ())

    def _has_foreign_key(self, table, constraint):
        rows = self.schema.new_connection().query(
            "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s "
            "AND CONSTRAINT_NAME = %s AND CONSTRAINT_TYPE = 'FOREIGN KEY'",
            (table, constraint),
        )
        return bool(rows)

    def up(self):
        # Idempotency guard: a re-run on an already-converted database is a
        # no-op rather than an error, matching the has_column guards used by
        # the other migrations in this folder.
        if self.schema.has_table("organizations"):
            return

        if not self.schema.has_table("departments"):
            raise Exception(
                "Neither `organizations` nor `departments` exists — nothing to convert."
            )

        statements = ["RENAME TABLE `departments` TO `organizations`"]

        # The FK has to go before the column, and the unique index with it.
        if self._has_foreign_key("departments", "departments_location_id_foreign"):
            statements.append(
                "ALTER TABLE `organizations` DROP FOREIGN KEY `departments_location_id_foreign`"
            )

        if self.schema.has_column("departments", "location_id"):
            statements.append("ALTER TABLE `organizations` DROP COLUMN `location_id`")

        statements.append(KIND_COLUMN_SQL)

        # members.department_id -> organization_id. The old FK must be dropped
        # first or MySQL refuses to rename the column underneath it.
        if self._has_foreign_key("members", "members_department_id_foreign"):
            statements.append(
                "ALTER TABLE `members` DROP FOREIGN KEY `members_department_id_foreign`"
            )

        statements.append(
            "ALTER TABLE `members` "
            "CHANGE COLUMN `department_id` `organization_id` INT UNSIGNED NOT NULL"
        )
        statements.append(
            "ALTER TABLE `members` "
            "ADD CONSTRAINT `members_organization_id_foreign` "
            "FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE"
        )

        self._run(statements)

    def down(self):
        """Reverse the rename.

        `location_id` comes back nullable and EMPTY — the department-to-building
        association is deliberately discarded by up() and cannot be recovered
        from this table. Restore it from a dump if you need those values back.
        """
        if not self.schema.has_table("organizations"):
            return

        statements = []

        if self._has_foreign_key("members", "members_organization_id_foreign"):
            statements.append(
                "ALTER TABLE `members` DROP FOREIGN KEY `members_organization_id_foreign`"
            )

        statements.append(
            "ALTER TABLE `members` "
            "CHANGE COLUMN `organization_id` `department_id` INT UNSIGNED NOT NULL"
        )

        if self.schema.has_column("organizations", "kind"):
            statements.append("ALTER TABLE `organizations` DROP COLUMN `kind`")

        statements.append("RENAME TABLE `organizations` TO `departments`")
        statements.append(
            "ALTER TABLE `departments` "
            "ADD COLUMN `location_id` INT UNSIGNED NULL AFTER `id`, "
            "ADD UNIQUE KEY `departments_location_id_unique` (`location_id`), "
            "ADD CONSTRAINT `departments_location_id_foreign` "
            "FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE CASCADE"
        )
        statements.append(
            "ALTER TABLE `members` "
            "ADD CONSTRAINT `members_department_id_foreign` "
            "FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE"
        )

        self._run(statements)
