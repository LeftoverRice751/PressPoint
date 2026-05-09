"""CreateAboutSectionsTable Migration."""

from masoniteorm.migrations import Migration


class CreateAboutSectionsTable(Migration):
    def up(self):
        with self.schema.create("about_sections") as table:
            table.increments("id")

            # Stable identifier used in URLs and templates. One of:
            # 'mission', 'values', 'history', 'quality', 'hymn', 'seal'.
            table.string("slug", 40).unique()

            table.string("title", 150)

            # Sanitized rich-text body. Used directly by 'quality', 'hymn',
            # and 'seal' (description). Null for sections that store all
            # their copy under `subsections` instead.
            table.long_text("body_html").nullable()

            # JSON array of {heading, body_html} for fixed-shape multi-part
            # sections ('mission' = Mission/Vision/Mandate, 'values' =
            # Group Values/Performance Pledge). Null otherwise.
            table.json("subsections").nullable()

            # Relative path under storage/ for the seal image.
            table.string("image_path", 255).nullable()

            # updated_by_id is nullable so we can seed without a user and
            # so historical rows survive user deletes.
            table.integer("updated_by_id").unsigned().nullable()

            table.timestamps()

            table.foreign("updated_by_id").references("id").on("users").on_delete("set null")

    def down(self):
        self.schema.drop("about_sections")
