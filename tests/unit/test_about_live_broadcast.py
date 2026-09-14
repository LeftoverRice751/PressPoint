"""Every About LSPU write tells the kiosk to re-fetch the About page.

sw-kiosk.js serves /kiosk/embed/about-lspu and /storage/About/ stale-while-
revalidate, so without a broadcast a saved section shows up one visit late.
"""

from unittest import TestCase
from unittest.mock import Mock, patch

from app.controllers.kiosk.AboutController import AboutController


def _ajax_request(inputs=None):
    inputs = inputs or {}
    request = Mock()
    request.input.side_effect = lambda key, default=None: inputs.get(key, default)
    request.header.side_effect = (
        lambda name: "XMLHttpRequest" if name == "X-Requested-With" else None
    )
    request.user.return_value = Mock(id=7)
    return request


def _response():
    response = Mock()
    response.json.side_effect = lambda payload, status=200: payload
    return response


class AboutLiveBroadcastTestCase(TestCase):
    def test_save_section_broadcasts_about_lspu(self):
        section = Mock(title="History")
        section.save = Mock()
        with patch(
            "app.controllers.kiosk.AboutController.AboutSection.where"
        ) as where_mock, patch(
            "app.controllers.kiosk.AboutController.KioskBroadcast.section_changed"
        ) as changed:
            where_mock.return_value.first.return_value = section
            AboutController().save_section(
                "history", _ajax_request({"title": "History", "body_html": "<p>x</p>"}), _response()
            )

        section.save.assert_called_once()
        changed.assert_called_once_with("about-lspu")

    def test_unknown_section_broadcasts_nothing(self):
        with patch(
            "app.controllers.kiosk.AboutController.KioskBroadcast.section_changed"
        ) as changed:
            AboutController().save_section("not-a-section", _ajax_request(), _response())
        changed.assert_not_called()

    def test_delete_milestone_broadcasts_about_lspu(self):
        row = Mock()
        row.delete = Mock()
        with patch(
            "app.controllers.kiosk.AboutController.AboutMilestone.where"
        ) as where_mock, patch(
            "app.controllers.kiosk.AboutController.KioskBroadcast.section_changed"
        ) as changed:
            where_mock.return_value.first.return_value = row
            AboutController().delete_milestone("3", _ajax_request(), _response())

        row.delete.assert_called_once()
        changed.assert_called_once_with("about-lspu")

    def test_deleting_a_missing_milestone_broadcasts_nothing(self):
        with patch(
            "app.controllers.kiosk.AboutController.AboutMilestone.where"
        ) as where_mock, patch(
            "app.controllers.kiosk.AboutController.KioskBroadcast.section_changed"
        ) as changed:
            where_mock.return_value.first.return_value = None
            AboutController().delete_milestone("3", _ajax_request(), _response())
        changed.assert_not_called()
