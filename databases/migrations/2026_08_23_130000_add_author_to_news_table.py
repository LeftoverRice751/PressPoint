"""AddAuthorToNewsTable Migration."""

from masoniteorm.migrations import Migration


class AddAuthorToNewsTable(Migration):
    def up(self):
        """Run the migrations.

        Until now `news` recorded nothing about who wrote or last touched a
        story. The Story Library's "Author" column was reading the free-text
        `source` field, which is the story's *source line* ("PIO", "CvSU
        Correspondent"), not an account — so a story that reached the public
        kiosk was unattributable. With several editors sharing the composer and
        a layout endpoint that rewrites the whole front page from one browser's
        DOM, "who did this?" had no answer at all.

        Both columns are nullable with ON DELETE SET NULL rather than CASCADE:
        removing a staff account must never delete the stories they wrote. An
        orphaned story keeps its content and simply reads as having no author.

        This is NOT a revival of the dropped `submitted_by` / `submitted_by_username`
        pair (see 2026_08_23_120000). Those were free-text strings on a flow that
        was never wired to a route; these are real foreign keys the composer and
        the review queue both write on every save.
        """
        with self.schema.table("news") as table:
            table.integer("author_id").unsigned().nullable()
            table.foreign("author_id").references("id").on("users").on_delete("set null")

            table.integer("updated_by_id").unsigned().nullable()
            table.foreign("updated_by_id").references("id").on("users").on_delete("set null")

    def down(self):
        """Revert the migrations."""
        with self.schema.table("news") as table:
            table.drop_foreign("news_author_id_foreign")
            table.drop_foreign("news_updated_by_id_foreign")
            table.drop_column("author_id")
            table.drop_column("updated_by_id")
