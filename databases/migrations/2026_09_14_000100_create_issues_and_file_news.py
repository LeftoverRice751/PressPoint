"""CreateIssuesAndFileNews Migration.

Gives the newsroom an ISSUE: a row with an owner, a number and its own set of
stories, so that every editor composes their own newsletter and the kiosk can
show several. Before this there was one implicit issue -- every published
story was "the front page", every editor edited the same canvas, and the issue
number was derived from the lead story's date.

Two parts:

  1. Schema. Create `issues`; add `news.issue_id` (nullable, ON DELETE SET
     NULL) so an issue can be removed without taking its stories with it.

  2. Data. File every existing story into an issue, so nothing is orphaned and
     an editor's current work becomes their Issue 1. One issue per distinct
     `author_id`, numbered in author order; stories with no author (the column
     is ON DELETE SET NULL, so the row genuinely occurs) go into one unowned
     issue. Soft-deleted stories are filed too, so a restore lands somewhere.

Issue status is not a column. It is derived from the stories, so the per-story
`status` column and the pipeline behind it are untouched by this migration.

This is a DATA migration, the class that broke this repo's history (see the
header of databases/schema.sql): it guards its own preconditions and returns
early rather than assuming the tables it needs exist. `down()` reverses the
whole thing -- column, then table -- so this is not a one-way door.
"""

from masoniteorm.migrations import Migration
from masoniteorm.query import QueryBuilder


class CreateIssuesAndFileNews(Migration):
    def up(self):
        if not self.schema.has_table("news"):
            return
        if self.schema.has_table("issues"):
            return

        with self.schema.create("issues") as table:
            table.increments("id")
            table.integer("number").unsigned()
            table.integer("owner_id").unsigned().nullable()
            table.string("title", 255).nullable()
            table.datetime("published_at").nullable()
            table.timestamps()
            table.soft_deletes()
            table.foreign("owner_id").references("id").on("users").on_delete("set null")
            table.index("owner_id")

        if not self.schema.has_column("news", "issue_id"):
            with self.schema.table("news") as table:
                table.integer("issue_id").unsigned().nullable()
                table.foreign("issue_id").references("id").on("issues").on_delete("set null")
                table.index("issue_id")

        # -- Data: file every story into an issue ------------------------------
        qb = QueryBuilder(connection=self.schema.connection)

        # Distinct authors, deleted rows included, in a stable order so the
        # numbering is reproducible. NULL sorts first in MySQL, so the unowned
        # issue is number 1 when it exists.
        rows = qb.table("news").select_raw("DISTINCT author_id").order_by("author_id").get()
        authors = []
        for row in rows:
            value = row["author_id"] if isinstance(row, dict) else getattr(row, "author_id", None)
            authors.append(value)

        number = 0
        for author_id in authors:
            number += 1
            issue_id = qb.table("issues").create({
                "number": number,
                "owner_id": author_id,
                "title": None,
                "published_at": None,
            })
            # QueryBuilder.create returns the inserted row's mapping on some
            # drivers and the id on others; take whichever we were given.
            if isinstance(issue_id, dict):
                issue_id = issue_id.get("id")
            elif hasattr(issue_id, "id"):
                issue_id = issue_id.id

            query = qb.table("news")
            if author_id is None:
                query = query.where_null("author_id")
            else:
                query = query.where("author_id", author_id)
            query.update({"issue_id": issue_id})

    def down(self):
        if self.schema.has_column("news", "issue_id"):
            with self.schema.table("news") as table:
                table.drop_foreign("news_issue_id_foreign")
                table.drop_index("news_issue_id_index")
                table.drop_column("issue_id")
        if self.schema.has_table("issues"):
            self.schema.drop("issues")
