from unittest.mock import patch

from app.services import KioskBroadcast
from tests import TestCase


class KioskBroadcastServiceTestCase(TestCase):
    def test_section_changed_delivers_section_and_stamp(self):
        with patch("app.services.KioskBroadcast.pusher_configured", return_value=True), patch(
            "app.services.KioskBroadcast._deliver"
        ) as deliver, patch("app.services.KioskBroadcast.time.time", return_value=1_700_000_000.123):
            sent = KioskBroadcast.section_changed("latest-news")

        self.assertTrue(sent)
        deliver.assert_called_once_with({"section": "latest-news", "stamp": 1_700_000_000_123})

    def test_deliver_uses_the_public_channel_and_event_name(self):
        with patch("app.services.KioskBroadcast.Broadcast.channel") as channel:
            KioskBroadcast._deliver({"section": "about-lspu", "stamp": 5})

        channel.assert_called_once_with(
            ["kiosk-content"],
            "app.events.KioskSectionChanged",
            {"section": "about-lspu", "stamp": 5},
        )

    def test_section_changed_is_false_when_pusher_unconfigured(self):
        with patch("app.services.KioskBroadcast.pusher_configured", return_value=False), patch(
            "app.services.KioskBroadcast._deliver"
        ) as deliver:
            self.assertFalse(KioskBroadcast.section_changed("latest-news"))
        deliver.assert_not_called()

    def test_section_changed_swallows_delivery_errors(self):
        with patch("app.services.KioskBroadcast.pusher_configured", return_value=True), patch(
            "app.services.KioskBroadcast._deliver", side_effect=RuntimeError("pusher down")
        ):
            self.assertFalse(KioskBroadcast.section_changed("latest-news"))

    def test_unknown_section_is_refused_without_delivery(self):
        with patch("app.services.KioskBroadcast.pusher_configured", return_value=True), patch(
            "app.services.KioskBroadcast._deliver"
        ) as deliver:
            self.assertFalse(KioskBroadcast.section_changed("org-chart"))
        deliver.assert_not_called()

    def test_pusher_configured_reads_broadcast_config(self):
        with patch(
            "app.services.KioskBroadcast.config",
            return_value={"pusher": {"key": "k", "app_id": "a", "secret": "s"}},
        ):
            self.assertTrue(KioskBroadcast.pusher_configured())
        with patch(
            "app.services.KioskBroadcast.config",
            return_value={"pusher": {"key": "k", "app_id": "", "secret": "s"}},
        ):
            self.assertFalse(KioskBroadcast.pusher_configured())
