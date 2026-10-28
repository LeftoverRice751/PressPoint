"""CreateAuditLogsTable Migration.

The audit trail for privileged actions (SECURITY.md W7, app/services/AuditLog.py).

`actor_id` is ON DELETE SET NULL and `actor_username` is a snapshot, so
removing an account keeps the record of what that account did -- which is
exactly when you want it. `ip` is 45 wide for a full IPv6 address.

Guarded like the other recent migrations (see the header of
databases/schema.sql): it returns early if the table already exists, so a
re-run or a database built from schema.sql is a no-op.
"""

from masoniteorm.migrations import Migration


class CreateAuditLogsTable(Migration):
    def up(self):
        if self.schema.has_table("audit_logs"):
            return

        with self.schema.create("audit_logs") as table:
            table.increments("id")
            table.integer("actor_id").unsigned().nullable()
            table.string("actor_username", 255).nullable()
            table.string("action", 64)
            table.string("target_type", 32).nullable()
            table.string("target_id", 64).nullable()
            table.text("details").nullable()
            table.string("ip", 45).nullable()
            table.timestamp("created_at", now=True)
            table.foreign("actor_id").references("id").on("users").on_delete("set null")
            table.index("action")
            table.index("actor_id")
            table.index("created_at")

    def down(self):
        self.schema.drop_table_if_exists("audit_logs")
