"""Clear session tokens still stored in plaintext.

    venv/bin/python scripts/purge_legacy_session_tokens.py           # report only
    venv/bin/python scripts/purge_legacy_session_tokens.py --apply   # clear them

Since SECURITY.md W3, users.remember_token holds a keyed hash (`h1:...`, see
app/services/SessionTokens.py). Rows written before that are upgraded the
first time their owner makes a request, so the deploy signed nobody out -- but
an account whose owner never comes back keeps a plaintext token, which is a
working session for anyone who reads the table. This clears those rows, which
signs out exactly those idle sessions; the owner just logs in again.

Also clears password_resets rows written before the change: their codes were
stored verbatim and can no longer be verified anyway (verify_otp compares the
digest), so they are dead weight that still leaks a code.

Reads by default; nothing is written without --apply.
"""

import argparse
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

import config.database  # noqa: F401,E402  (binds the ORM connection resolver)

from masoniteorm.query import QueryBuilder  # noqa: E402

from app.services.SessionTokens import PREFIX  # noqa: E402

# LEFT() rather than NOT LIKE 'h1:%': a future prefix containing % or _ would
# turn LIKE into a wildcard match and quietly widen what counts as hashed.
LEGACY = "{col} IS NOT NULL AND {col} <> '' AND LEFT({col}, %s) <> %s"


def _builder():
    from config.database import DATABASES

    return QueryBuilder(connection_details=DATABASES)


def _count(table, column):
    rows = _builder().statement(
        f"SELECT COUNT(*) AS n FROM {table} WHERE " + LEGACY.format(col=column),  # nosec B608
        [len(PREFIX), PREFIX],
    )
    return int(rows[0]["n"]) if rows else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="clear the rows (default: report)")
    args = parser.parse_args()

    sessions = _count("users", "remember_token")
    resets = _count("password_resets", "token")
    print(f"users with a plaintext session token: {sessions}")
    print(f"password_resets rows with a plaintext code: {resets}")

    if not args.apply:
        print("report only -- rerun with --apply to clear them")
        return

    _builder().statement(
        "UPDATE users SET remember_token = NULL WHERE "  # nosec B608
        + LEGACY.format(col="remember_token"),
        [len(PREFIX), PREFIX],
    )
    _builder().statement(
        "DELETE FROM password_resets WHERE " + LEGACY.format(col="token"),  # nosec B608
        [len(PREFIX), PREFIX],
    )
    print(f"cleared {sessions} session token(s) and {resets} reset code(s)")


if __name__ == "__main__":
    main()
