"""Keep the unit suite off the network.

`.env` in this repo is the production config and carries real Pusher
credentials, so any controller that now calls KioskBroadcast.section_changed
would make a live HTTP request to pusher.com from inside a test. This stubs
the one delivery seam for every unit test; a test that wants to assert on a
broadcast patches `app.services.KioskBroadcast._deliver` (or
`section_changed`) itself, which takes precedence over this fixture.
"""

from unittest.mock import Mock, patch

import pytest
from masonite.cache.drivers.FileDriver import FileDriver
from masonite.rates.RateLimiter import RateLimiter


@pytest.fixture(autouse=True)
def _stub_kiosk_broadcast_delivery():
    with patch("app.services.KioskBroadcast.Broadcast.channel"):
        yield


@pytest.fixture(autouse=True)
def _stub_audit_log_writes():
    """Keep test actions out of the production audit trail.

    On a dev box the suite runs against the live database (see CLAUDE.md), and
    every controller test that approves a story or deletes a user now calls
    AuditLog.record(). Unstubbed, each run would append fake rows to the real
    audit_logs -- the one table whose whole value is that every row happened.
    Stubbed at the write seam, so record()'s own logic still runs; tests that
    assert on rows patch `_builder` themselves, which takes precedence.
    """

    class _Discard:
        def new(self):
            return self

        def table(self, name):
            return self

        def create(self, payload):
            return payload

    with patch("app.services.AuditLog._builder", lambda: _Discard()):
        yield


@pytest.fixture(autouse=True)
def _isolate_otp_attempts(tmp_path_factory):
    """Keep wrong-code counts out of the production cache directory.

    `.env` points the file cache at the directory the live workers share (see
    CLAUDE.md), so a test submitting a wrong code would count against that
    address for real. This is the real RateLimiter and file driver on a throwaway
    directory, built on first use because few tests reach it.
    """
    built = []

    def limiter():
        if not built:
            location = tmp_path_factory.mktemp("otp-attempts")
            driver = FileDriver(None).set_options({"location": str(location)})
            store = Mock()
            store.store.return_value = driver
            app = Mock()
            app.make.return_value = store
            built.append(RateLimiter(app))
        return built[0]

    with patch("app.services.OtpAttempts._limiter", limiter):
        yield


@pytest.fixture(autouse=True)
def _stub_issue_creation():
    """Keep the unit suite from creating issues for editors that do not exist.

    NewsController.store() files a new story into the author's open issue,
    creating one on first save (Issues.ensure_current_for). The store tests
    drive it with a stand-in editor (`Mock(id=7, role="editor")`) who is not
    in `users`, so that create trips the owner FK against the live database.
    The controller is right to refuse; the tests just need an issue to file
    into. A test that cares about the issue itself patches this seam again,
    which takes precedence.
    """
    # Stubbed at the MODEL write, not at the service function: the service
    # module is one object however it is imported, so patching
    # ensure_current_for would hide it from its own tests. Issue.create is the
    # one call that hits the FK; everything above it runs for real.
    with patch(
        "app.models.Issue.Issue.create",
        return_value=type("Issue", (), {"id": 1, "number": 1, "owner_id": 7})(),
    ):
        yield


@pytest.fixture
def actor_may_change_any_story():
    """For tests of what a write does, whose request doubles are nobody in particular.

    Opt-in with `pytestmark`, so the ownership rule itself stays real in
    test_news_ownership.py.
    """
    with patch("app.controllers.gears.NewsController._may_change_story", return_value=True):
        yield


@pytest.fixture
def preview_already_read():
    """For tests of what an approval does; test_news_ownership.py covers the stamp."""
    with patch("app.controllers.gears.ReviewController._matches_preview", return_value=True):
        yield
