"""One-off purge of the old newsletter's data, run AFTER the photo-post code ships.

    venv/bin/python scripts/purge_newsletters.py                          # dry run: counts only
    venv/bin/python scripts/purge_newsletters.py --confirm --backup PATH  # delete

What goes: every legacy `news` row (drafts and soft-deleted rows included), all
`issues` and `issue_events` rows, the legacy stories' photos (+ .large/.thumb
derivatives) and logo files, and the editorial-decision notifications that
belong to them. audit_logs is left alone: it is append-only history.

Legacy rule (printed by the dry run). The script runs after the new code is
live, so editors may already have written real photo posts. NewsController.store
and PostLibrary.duplicate always write image_crop and source_lines, and only
the post editor sets kicker/expires_at, so a row with none of them was never
touched by it. A row that still carries an issue_id is the newsletter's whatever
else it holds. Nothing the new flow wrote can match.

Notifications: their `link` is always the generic "/gears/dashboard?page=news"
(ReviewController._EDITOR_LINK), never a story id, so a link can't say which
story a row is about. The rule is therefore by type -- news.approved and
news.rejected -- limited to rows older than the oldest surviving (non-legacy)
news row, so decisions on real photo posts keep their bell entries. With no
surviving posts every such notification goes.

Safety: nothing is written without --confirm AND a non-empty --backup file
(take a mysqldump first). The deletes run in ONE transaction; files are removed
only after it commits, so a rollback never strands rows pointing at deleted
photos. A failed file delete is logged and counted, never fatal. Run it before
the drop-newsletter migration: the rule reads news.issue_id.
"""

import argparse
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

import config.database  # noqa: F401,E402  (binds the ORM connection resolver)

from masoniteorm.query import QueryBuilder  # noqa: E402

from app.services.ImageDerivatives import (  # noqa: E402
    VARIANTS,
    delete_image_and_variants,
    variant_relpath,
)
from app.services.StorageRouter import absolute_path, is_safe_path  # noqa: E402

LEGACY_WHERE = (
    "expires_at IS NULL AND (issue_id IS NOT NULL OR "
    "(kicker IS NULL AND image_crop IS NULL AND source_lines IS NULL))"
)
LEGACY_RULE = f"legacy news = {LEGACY_WHERE}"

NOTIFICATION_TYPES = "('news.approved', 'news.rejected')"


def _builder():
    from config.database import DATABASES

    return QueryBuilder(connection_details=DATABASES)


def existing_files(stored_path):
    """The photo and whichever derivatives are actually on disk."""
    if not stored_path:
        return []
    found = []
    for relative in [stored_path] + [variant_relpath(stored_path, v) for v, _e in VARIANTS]:
        try:
            if is_safe_path(relative) and os.path.isfile(absolute_path(relative)):
                found.append(relative)
        except OSError:
            pass
    return found


def _count(builder, sql, bindings=None):
    rows = builder.statement(sql, bindings or [])
    return int(rows[0]["n"]) if rows else 0


def _paths(rows, column):
    return {str(r[column]).strip() for r in rows if r.get(column) and str(r[column]).strip()}


def _notification_filter(builder):
    """WHERE clause + bindings for the notification rule (see module docstring)."""
    rows = builder.statement(
        f"SELECT MIN(created_at) AS c FROM news WHERE NOT ({LEGACY_WHERE})"  # nosec B608
    )
    cutoff = rows[0]["c"] if rows else None
    clause = f"type IN {NOTIFICATION_TYPES}"
    if cutoff is None:
        return clause, []
    return clause + " AND created_at < %s", [cutoff]


def plan(builder):
    legacy = builder.statement(
        f"SELECT image, logo_path FROM news WHERE {LEGACY_WHERE}"  # nosec B608
    )
    survivors = builder.statement(
        f"SELECT image, logo_path FROM news WHERE NOT ({LEGACY_WHERE})"  # nosec B608
    )
    # Never delete a file a surviving post still points at.
    kept = _paths(survivors, "image") | _paths(survivors, "logo_path")
    images = _paths(legacy, "image") - kept
    logos = _paths(legacy, "logo_path") - kept
    where, bindings = _notification_filter(builder)
    return {
        "news": _count(
            builder, f"SELECT COUNT(*) AS n FROM news WHERE {LEGACY_WHERE}"  # nosec B608
        ),
        # Legacy stories an editor already reworked in the new editor (crop set).
        "reworked": _count(
            builder,
            "SELECT COUNT(*) AS n FROM news WHERE expires_at IS NULL "  # nosec B608
            "AND issue_id IS NOT NULL AND image_crop IS NOT NULL",
        ),
        "issues": _count(builder, "SELECT COUNT(*) AS n FROM issues"),
        "issue_events": _count(builder, "SELECT COUNT(*) AS n FROM issue_events"),
        "notifications": _count(
            builder,
            f"SELECT COUNT(*) AS n FROM notifications WHERE {where}",  # nosec B608
            bindings,
        ),
        "notification_where": (where, bindings),
        "images": sorted(images),
        "logos": sorted(logos),
        "image_files": sum(len(existing_files(p)) for p in images),
        "logo_files": sum(len(existing_files(p)) for p in logos),
    }


def report(counts):
    print(LEGACY_RULE)
    print(f"notifications rule = type IN {NOTIFICATION_TYPES}, older than the oldest kept post")
    print(f"news rows: {counts['news']}")
    print(f"  of which issue-bearing rows with image_crop set (reworked): {counts['reworked']}")
    print(f"issues: {counts['issues']}")
    print(f"issue_events: {counts['issue_events']}")
    print(f"notifications: {counts['notifications']}")
    print(f"image files: {counts['image_files']} (photos plus derivatives on disk)")
    print(f"logo files: {counts['logo_files']}")


def purge(builder, counts):
    """Delete every row in one transaction. Raises (after rolling back) on failure."""
    where, bindings = counts["notification_where"]
    builder.begin_transaction()
    try:
        builder.statement("DELETE FROM issue_events")
        builder.statement(f"DELETE FROM notifications WHERE {where}", bindings)  # nosec B608
        builder.statement(f"DELETE FROM news WHERE {LEGACY_WHERE}")  # nosec B608
        builder.statement("DELETE FROM issues")
    except Exception:
        builder.rollback()
        raise
    builder.commit()


def remove_files(counts, delete_file):
    """Files go after commit; a failure is reported, never raised.

    delete_image_and_variants swallows OSError itself, so a clean return proves
    nothing: re-check the disk and count whatever is still there as failed."""
    removed = failed = 0
    for path in counts["images"] + counts["logos"]:
        try:
            delete_file(path)
        except Exception as exc:
            print(f"could not delete {path}: {exc}", file=sys.stderr)
        left = existing_files(path)
        if left:
            failed += 1
            print(f"still on disk after delete: {', '.join(left)}", file=sys.stderr)
        else:
            removed += 1
    return removed, failed


def main(argv=None, builder_factory=_builder, delete_file=delete_image_and_variants):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--confirm", action="store_true", help="delete (default: dry run)")
    parser.add_argument("--backup", help="path of a non-empty mysqldump taken first")
    args = parser.parse_args(argv)

    if args.confirm:
        try:
            size = os.path.getsize(args.backup) if args.backup else 0
        except OSError:
            size = 0
        if size <= 0:
            print(
                "refusing to delete: --confirm needs --backup PATH naming an existing, "
                "non-empty backup file. Nothing was touched.",
                file=sys.stderr,
            )
            return 2

    builder = builder_factory()
    counts = plan(builder)
    report(counts)

    if not args.confirm:
        print("dry run -- nothing deleted. Rerun with --confirm --backup PATH.")
        return 0

    try:
        # A FRESH builder: plan()'s statement() calls ran at transaction level 0, so
        # MySQLConnection.query() closed the connection and nulled _connection, and
        # begin() on that builder would call None.begin(). begin() must be first.
        purge(builder_factory(), counts)
    except Exception as exc:
        print(f"purge failed and was rolled back, no files touched: {exc}", file=sys.stderr)
        return 1
    removed, failed = remove_files(counts, delete_file)
    print(f"rows deleted; {removed} file path(s) removed, {failed} file delete(s) failed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
