"""AddEditorialFieldsToNewsTable Migration."""

from masoniteorm.migrations import Migration


class AddEditorialFieldsToNewsTable(Migration):
    """Dek (standfirst), photo caption, and photo credit for news stories."""

    def up(self):
        if not self.schema.has_column("news", "dek"):
            with self.schema.table("news") as table:
                table.string("dek").nullable()

        if not self.schema.has_column("news", "image_caption"):
            with self.schema.table("news") as table:
                table.string("image_caption").nullable()

        if not self.schema.has_column("news", "image_credit"):
            with self.schema.table("news") as table:
                table.string("image_credit").nullable()

    def down(self):
        for column in ("image_credit", "image_caption", "dek"):
            if self.schema.has_column("news", column):
                with self.schema.table("news") as table:
                    table.drop_column(column)
