"""CreateSiteSettingsTable Migration."""

from masoniteorm.migrations import Migration


class CreateSiteSettingsTable(Migration):
    """A generic key/value store for site-wide settings that have no home of
    their own. Currently holds one row — 'branding.logo_path' — but exists as
    key/value so the next such setting needs no migration.

    Columns are named setting_key / setting_value rather than key / value
    because KEY is a reserved word in MySQL.
    """

    def up(self):
        with self.schema.create("site_settings") as table:
            table.increments("id")
            table.string("setting_key", 100).unique()
            table.text("setting_value").nullable()
            table.timestamps()

    def down(self):
        self.schema.drop("site_settings")
