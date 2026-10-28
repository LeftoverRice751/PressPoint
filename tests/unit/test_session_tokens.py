"""Session tokens and OTP codes are stored as keyed hashes, never verbatim.

A session on this app *is* `users.remember_token`: the slot cookie carries it
and LoadSlotUserMiddleware looks the user up by it. Stored verbatim, any read
of the users table -- a dump, a backup, a read-only SQL injection -- was a
working session for every account, no password cracking needed. Same for the
6-digit codes in `password_resets.token` (SECURITY.md W3).

Now the column holds `h1:` + HMAC-SHA256(APP_KEY, token) and only the cookie
holds the plaintext. The HMAC is keyed so a leaked table alone cannot even be
brute-forced for the 10^6 OTP space. Existing plaintext rows are upgraded the
first time their owner makes a request, so nobody is signed out by the deploy.
"""

from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import MagicMock, patch

from app.models.User import User
from app.services import SessionTokens

KEY = "test-key-not-the-app-key"


def _query(rows):
    """A stand-in for User.where(col, value).first() over a dict of rows."""

    def where(column, value):
        assert column == "remember_token"
        return SimpleNamespace(first=lambda: rows.get(value))

    return where


@patch.object(SessionTokens, "_key", lambda: KEY.encode())
class DigestTest(TestCase):
    def test_digest_is_prefixed_keyed_and_not_the_token(self):
        d = SessionTokens.digest("abc")
        self.assertTrue(d.startswith("h1:"))
        self.assertNotIn("abc", d)
        self.assertEqual(d, SessionTokens.digest("abc"))
        self.assertNotEqual(d, SessionTokens.digest("abd"))
        with patch.object(SessionTokens, "_key", lambda: b"another key"):
            self.assertNotEqual(d, SessionTokens.digest("abc"))

    def test_otp_digest_is_bound_to_the_email(self):
        a = SessionTokens.otp_digest("a@x.test", "123456")
        self.assertNotEqual(a, SessionTokens.otp_digest("b@x.test", "123456"))
        self.assertNotEqual(a, SessionTokens.digest("123456"))
        self.assertNotIn("123456", a)
        # Email is matched case-insensitively everywhere else in the reset flow.
        self.assertEqual(a, SessionTokens.otp_digest(" A@X.test ", "123456"))


@patch.object(SessionTokens, "_key", lambda: KEY.encode())
class UserTokenTest(TestCase):
    def test_set_remember_token_stores_only_the_hash(self):
        user = User()
        returned = user.set_remember_token()
        self.assertIs(returned, user)  # Masonite chains .save() off it
        plain = SessionTokens.plain_token(user)
        self.assertTrue(plain)
        self.assertEqual(user.remember_token, SessionTokens.digest(plain))
        # The plaintext is an instance attribute, never a dirty column.
        self.assertNotIn(plain, str(user.__dict__.get("__dirty_attributes__")))

    def test_each_call_mints_a_fresh_unguessable_token(self):
        a, b = User(), User()
        a.set_remember_token()
        b.set_remember_token()
        self.assertNotEqual(SessionTokens.plain_token(a), SessionTokens.plain_token(b))
        self.assertGreaterEqual(len(SessionTokens.plain_token(a)), 40)


@patch.object(SessionTokens, "_key", lambda: KEY.encode())
class FindUserTest(TestCase):
    def test_hashed_row_is_found_by_its_plaintext(self):
        user = MagicMock()
        rows = {SessionTokens.digest("tok"): user}
        with patch.object(SessionTokens.User, "where", side_effect=_query(rows)):
            self.assertIs(SessionTokens.find_user("tok"), user)
        user.save.assert_not_called()

    def test_legacy_plaintext_row_is_upgraded_on_use(self):
        user = MagicMock()
        rows = {"legacy-uuid": user}
        with patch.object(SessionTokens.User, "where", side_effect=_query(rows)):
            self.assertIs(SessionTokens.find_user("legacy-uuid"), user)
        self.assertEqual(user.remember_token, SessionTokens.digest("legacy-uuid"))
        user.save.assert_called_once()

    def test_a_stolen_hash_cannot_be_replayed_as_a_cookie(self):
        """The whole point: a value copied out of the column must not log in."""
        user = MagicMock()
        stolen = SessionTokens.digest("tok")
        rows = {stolen: user}
        with patch.object(SessionTokens.User, "where", side_effect=_query(rows)):
            self.assertIsNone(SessionTokens.find_user(stolen))

    def test_unknown_and_empty_tokens_find_nobody(self):
        with patch.object(SessionTokens.User, "where", side_effect=_query({})):
            self.assertIsNone(SessionTokens.find_user("nope"))
            self.assertIsNone(SessionTokens.find_user(""))
            self.assertIsNone(SessionTokens.find_user(None))


class CallSitesTest(TestCase):
    """Every place that resolved a session by raw equality now goes through
    SessionTokens.find_user -- one missed call site is a session that never
    resolves (or, worse, the old plaintext comparison surviving)."""

    def test_load_slot_user_middleware_resolves_through_find_user(self):
        from app.middlewares.LoadSlotUserMiddleware import LoadSlotUserMiddleware

        request = MagicMock(tab_slot=0)
        request.cookie.return_value = "tok"
        with patch("app.middlewares.LoadSlotUserMiddleware.SessionTokens") as tokens:
            tokens.find_user.return_value = "the-user"
            LoadSlotUserMiddleware().before(request, MagicMock())
        tokens.find_user.assert_called_once_with("tok")
        request.set_user.assert_called_once_with("the-user")

    def test_no_raw_remember_token_lookups_remain(self):
        import pathlib
        import re

        offenders = []
        for path in pathlib.Path("app").rglob("*.py"):
            if path.name == "SessionTokens.py":
                continue
            if re.search(r"where\(\s*[\"']remember_token[\"']", path.read_text()):
                offenders.append(str(path))
        self.assertEqual(offenders, [])
