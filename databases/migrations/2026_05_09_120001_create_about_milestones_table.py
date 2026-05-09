"""CreateAboutMilestonesTable Migration."""

from masoniteorm.migrations import Migration


class CreateAboutMilestonesTable(Migration):
    def up(self):
        with self.schema.create("about_milestones") as table:
            table.increments("id")

            # String allows ranges like "1952-1957" or "ca. 1900".
            table.string("year", 20)

            table.string("heading", 200)

            table.long_text("body_html")

            # Relative path under storage/ for an optional milestone image.
            table.string("image_path", 255).nullable()

            # Manual ordering on the timeline. Lower = earlier in the
            # rendered list. Editor reorder buttons swap this column.
            table.integer("sort_order").default(0)

            table.timestamps()

    def down(self):
        self.schema.drop("about_milestones")
