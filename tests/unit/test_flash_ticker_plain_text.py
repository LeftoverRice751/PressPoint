"""The flash ticker must carry plain text, never the stored HTML.

`news.description` is Quill HTML sanitised on write, and welcome-screen.js
renders every ticker field through `escapeHtml()` -- so a body handed over
verbatim showed up on the campus terminal as a literal `<p>Despite the …</p>`.
The headline already went through `_html_to_text()`; the body did not. Both
the polled `/kiosk/flash-updates` builder and the Pusher `new-news` payload
have to agree, or the band changes shape the moment a story is published.

Entities matter too: `bleach.clean(tags=[])` leaves `&amp;` encoded, and the
client escapes again, so "Tom & Jerry" would read "Tom &amp; Jerry" on glass.
"""

from datetime import datetime, timedelta
from unittest import TestCase
from unittest.mock import Mock, patch

from app.controllers.gears.NewsController import _build_flash_payload
from app.controllers.kiosk.WelcomeController import WelcomeController

BODY = "<p>Tom &amp; Jerry <strong>win</strong> the cup.</p><p>Second paragraph.</p>"
TITLE = '<span class="ql-font-serif">Cats &amp; Mice</span>'


def _story():
    return Mock(
        title=TITLE,
        status="published",
        description=BODY,
        published_at=None,
        created_at=datetime.now() - timedelta(hours=1),
    )


class FlashTickerPlainTextTestCase(TestCase):
    def _ticker(self):
        controller = WelcomeController()
        with patch(
            "app.controllers.kiosk.WelcomeController.News"
        ) as news_mock, patch(
            "app.controllers.kiosk.WelcomeController.Events"
        ) as events_mock:
            news_mock.where_raw.return_value.get.return_value = [_story()]
            events_mock.where_raw.return_value.get.return_value = []
            return controller._build_flash_articles()

    def test_polled_ticker_copy_is_plain_text(self):
        (item,) = self._ticker()
        self.assertEqual(item["copy"], "Tom & Jerry win the cup. Second paragraph.")
        self.assertEqual(item["headline"], "Cats & Mice")

    def test_broadcast_payload_matches_the_polled_shape(self):
        payload = _build_flash_payload(_story())
        self.assertEqual(payload["copy"], "Tom & Jerry win the cup. Second paragraph.")
        self.assertEqual(payload["headline"], "Cats & Mice")

    def test_event_description_without_markup_is_untouched(self):
        controller = WelcomeController()
        with patch(
            "app.controllers.kiosk.WelcomeController.News"
        ) as news_mock, patch(
            "app.controllers.kiosk.WelcomeController.Events"
        ) as events_mock:
            news_mock.where_raw.return_value.get.return_value = []
            events_mock.where_raw.return_value.get.return_value = [
                Mock(
                    title="Foundation Day",
                    description="Gates open 8am",
                    event_date=None,
                    created_at=datetime.now() - timedelta(hours=1),
                )
            ]
            (item,) = controller._build_flash_articles()
        self.assertEqual(item["copy"], "Gates open 8am")
