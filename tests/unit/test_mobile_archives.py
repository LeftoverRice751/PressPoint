from unittest.mock import Mock, patch

from app.controllers.kiosk.ArchivesController import ArchivesController
from tests import TestCase


PAYLOAD = {
    "archives": [{"id": 3, "name": "Issue", "type": "Magazine", "year": 2025}],
    "archive_years": [2025, 2024],
    "selected_year": 2025,
}


class MobileArchivesTestCase(TestCase):
    """The phone page is a skin over the kiosk page: same controller, same
    cached payload, different template. These tests pin that contract so a
    change to one surface cannot silently starve the other."""

    def _render(self, method_name):
        controller = ArchivesController()
        view = Mock()
        view.render.return_value = "rendered"

        with patch.object(ArchivesController, "_cached_payload", return_value=PAYLOAD):
            result = getattr(controller, method_name)(view)

        self.assertEqual(result, "rendered")
        return view.render.call_args

    def test_mobile_renders_the_mobile_template(self):
        template, context = self._render("mobile")[0]

        self.assertEqual(template, "mobile/archives")
        self.assertEqual(context["archives"], PAYLOAD["archives"])
        self.assertEqual(context["archive_years"], PAYLOAD["archive_years"])
        self.assertEqual(context["selected_year"], PAYLOAD["selected_year"])

    def test_kiosk_still_renders_the_kiosk_template(self):
        template, _context = self._render("show")[0]

        self.assertEqual(template, "kiosk/archives")

    def test_both_surfaces_receive_identical_archive_data(self):
        """The archive data must match exactly. Only the kiosk-specific QR
        handoff may differ -- if any archive key ever diverges, one surface is
        showing the reader something the other is not."""
        _mobile_template, mobile_context = self._render("mobile")[0]
        _kiosk_template, kiosk_context = self._render("show")[0]

        shared = ("archives", "archive_years", "selected_year", "active_nav")
        for key in shared:
            self.assertEqual(mobile_context[key], kiosk_context[key], key)

    def test_kiosk_carries_an_absolute_qr_url_and_mobile_does_not(self):
        """The QR must be absolute: a phone scanning a relative path, or the
        kiosk's own internal host, cannot reach the site. The phone page has
        no QR at all -- it would only point at itself."""
        _kiosk_template, kiosk_context = self._render("show")[0]
        _mobile_template, mobile_context = self._render("mobile")[0]

        url = kiosk_context["mobile_archives_url"]
        self.assertTrue(url.startswith("http"), url)
        self.assertTrue(url.endswith("/m/archives"), url)
        self.assertNotIn("mobile_archives_url", mobile_context)

    def test_mobile_route_is_registered(self):
        from routes.public import ROUTES

        paths = [route.url for route in ROUTES]
        self.assertIn("/m/archives", paths)
