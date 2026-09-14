from unittest.mock import Mock, patch

from app.controllers.gears.NewsController import NewsController
from tests import TestCase


class NewsControllerPriorityTestCase(TestCase):
    def setUp(self):
        super().setUp()
        # store() requires a category and validates it against a LIVE row, so
        # every store test needs one. Patched rather than seeded because these
        # tests never touch the database — the real find_live would swallow
        # the connection error and return None, failing the request.
        patcher = patch(
            "app.controllers.gears.NewsController.NewsCategories.find_live",
            return_value=Mock(id=1, name="Campus News"),
        )
        self.addCleanup(patcher.stop)
        patcher.start()

    def test_new_story_without_explicit_priority_appends_after_current_lead(self):
        """A newly created story posts priority='0' from the composer today
        (see resources/js/news-dashboard.js). Under the new ascending sort,
        priority 0 would sit below every existing story and instantly steal
        the main/lead slot. store() must instead append the new story to
        the end of the current order (max existing priority + 1), not
        displace whatever is already leading."""
        controller = NewsController()

        inputs = {
            "title": "Fresh Story",
            "description": "<p>Body</p>",
            "source": "",
            "location": "",
            "dek": "",
            "image_caption": "",
            "image_credit": "",
            "layout_type": "brief",
            "status": "approved",
            "published_at": "",
            "priority": "0",
            "image": None,
            "article_id": "",
            "category_id": "1",
        }
        request = Mock()
        request.input.side_effect = lambda key: inputs.get(key)
        request.header.return_value = None

        storage = Mock()
        response = Mock()
        redirect_response = Mock()
        redirect_response.with_success.return_value = "redirected"
        response.redirect.return_value = redirect_response

        created_story = Mock(id=99, image=None)
        existing_max = Mock(priority=7)  # the existing lead story sits at priority 7

        with patch(
            "app.controllers.gears.NewsController.News.max",
            return_value=Mock(get=Mock(return_value=[existing_max])),
        ), patch(
            "app.controllers.gears.NewsController.News.create", return_value=created_story
        ) as create_mock, patch(
            "app.controllers.gears.NewsController.NewNews"
        ), patch(
            "app.controllers.gears.NewsController.Cache"
        ):
            controller.store(request, storage, response)

        self.assertTrue(create_mock.called)
        self.assertEqual(create_mock.call_args.kwargs["priority"], 8)

    def test_explicit_nonzero_priority_is_respected_for_new_stories(self):
        """If a future UI does send a real priority for a new story, that
        value must not be overridden by the append-to-end fallback."""
        controller = NewsController()

        inputs = {
            "title": "Fresh Story",
            "description": "<p>Body</p>",
            "source": "",
            "location": "",
            "dek": "",
            "image_caption": "",
            "image_credit": "",
            "layout_type": "brief",
            "status": "approved",
            "published_at": "",
            "priority": "3",
            "image": None,
            "article_id": "",
            "category_id": "1",
        }
        request = Mock()
        request.input.side_effect = lambda key: inputs.get(key)
        request.header.return_value = None

        storage = Mock()
        response = Mock()
        redirect_response = Mock()
        redirect_response.with_success.return_value = "redirected"
        response.redirect.return_value = redirect_response

        created_story = Mock(id=100, image=None)

        with patch("app.controllers.gears.NewsController.News.max") as max_mock, patch(
            "app.controllers.gears.NewsController.News.create", return_value=created_story
        ) as create_mock, patch(
            "app.controllers.gears.NewsController.NewNews"
        ), patch(
            "app.controllers.gears.NewsController.Cache"
        ):
            controller.store(request, storage, response)

        self.assertTrue(create_mock.called)
        self.assertEqual(create_mock.call_args.kwargs["priority"], 3)
        # An explicit non-zero priority must skip the max-priority lookup entirely.
        max_mock.assert_not_called()
