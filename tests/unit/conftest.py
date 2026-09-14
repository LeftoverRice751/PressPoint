"""Keep the unit suite off the network.

`.env` in this repo is the production config and carries real Pusher
credentials, so any controller that now calls KioskBroadcast.section_changed
would make a live HTTP request to pusher.com from inside a test. This stubs
the one delivery seam for every unit test; a test that wants to assert on a
broadcast patches `app.services.KioskBroadcast._deliver` (or
`section_changed`) itself, which takes precedence over this fixture.
"""

from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def _stub_kiosk_broadcast_delivery():
    with patch("app.services.KioskBroadcast.Broadcast.channel"):
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
