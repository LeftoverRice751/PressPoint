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
