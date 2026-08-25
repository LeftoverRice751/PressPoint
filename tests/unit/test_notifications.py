"""The dashboard bell.

An approval decision happens while the editor who submitted the story is
somewhere else. A toast reaches whoever is looking at the screen at that moment
— the admin who just clicked Approve — so the decision has to be persisted
against the editor's account instead.

The scoping tests are the important ones: every endpoint takes an id from the
URL, and without a `user_id` predicate any signed-in account could read or clear
someone else's notifications by guessing integers.
"""

from unittest import TestCase
from unittest.mock import Mock, patch

from app.controllers.gears.NotificationController import NotificationController
from app.services import Notifications


def _request(user_id=7, params=None):
    request = Mock()
    request.param.side_effect = lambda key, default="": (params or {}).get(key, default)
    request.user.return_value = Mock(id=user_id) if user_id else None
    return request


def _response():
    return Mock()


def _body(response):
    return response.json.call_args[0][0]


def _status(response):
    return response.json.call_args[1]["status"]


class NotifyTestCase(TestCase):
    def test_notify_writes_a_row_for_the_addressee(self):
        with patch("app.services.Notifications.Notification") as model:
            Notifications.notify(5, "news.approved", "Published", "well done", "/x")

        kwargs = model.create.call_args.kwargs
        self.assertEqual(kwargs["user_id"], 5)
        self.assertEqual(kwargs["type"], "news.approved")

    def test_notify_without_an_addressee_is_a_no_op(self):
        """A story whose author account was deleted has author_id NULL. That
        must not raise in the middle of an admin's approval."""
        with patch("app.services.Notifications.Notification") as model:
            self.assertIsNone(Notifications.notify(None, "news.approved", "x"))
            model.create.assert_not_called()

    def test_notify_never_raises_into_the_editorial_action(self):
        """Recording the notification is the less important half of approving a
        story — it must not be able to fail the approval."""
        with patch("app.services.Notifications.Notification") as model:
            model.create.side_effect = RuntimeError("database is down")
            self.assertIsNone(Notifications.notify(5, "news.approved", "x"))

    def test_unread_count_survives_a_database_error(self):
        """Polled every 20s by every open dashboard; a failure here must not
        take the poll down."""
        with patch("app.services.Notifications.Notification") as model:
            model.where.side_effect = RuntimeError("nope")
            self.assertEqual(Notifications.unread_count(5), 0)


class ScopingTestCase(TestCase):
    def test_mark_read_is_scoped_to_the_owner(self):
        """The predicate that stops one editor clearing another's bell."""
        with patch("app.services.Notifications.Notification") as model:
            chain = model.where.return_value.where.return_value
            chain.first.return_value = None
            self.assertFalse(Notifications.mark_read(7, 42))

        # user_id and id both constrain the lookup.
        self.assertEqual(model.where.call_args_list[0][0], ("id", 42))
        self.assertEqual(model.where.return_value.where.call_args[0], ("user_id", 7))

    def test_read_endpoint_reports_404_for_someone_elses_notification(self):
        """404 rather than 403: confirming "that exists but is not yours" is a
        needless disclosure."""
        controller = NotificationController()
        response = _response()
        with patch("app.controllers.gears.NotificationController.Notifications") as svc:
            svc.mark_read.return_value = False
            controller.read(_request(params={"id": "42"}), response)

        self.assertEqual(_status(response), 404)

    def test_endpoints_refuse_an_unauthenticated_request(self):
        controller = NotificationController()
        for method in ("index", "read", "read_all"):
            response = _response()
            getattr(controller, method)(_request(user_id=None), response)
            self.assertEqual(_status(response), 401)


class BellPayloadTestCase(TestCase):
    def test_index_returns_rows_and_the_unread_count(self):
        controller = NotificationController()
        response = _response()
        row = Mock(
            id=1,
            type="news.rejected",
            title="Sent back",
            message="Needs a source.",
            link="/gears/dashboard?page=news",
            read_at=None,
            created_at=None,
        )

        with patch("app.controllers.gears.NotificationController.Notifications") as svc:
            svc.recent_for.return_value = [row]
            svc.unread_count.return_value = 1
            controller.index(_request(), response)

        body = _body(response)
        self.assertEqual(body["unread"], 1)
        self.assertEqual(body["notifications"][0]["title"], "Sent back")
        self.assertFalse(body["notifications"][0]["read"])

    def test_read_all_clears_the_badge(self):
        controller = NotificationController()
        response = _response()
        with patch("app.controllers.gears.NotificationController.Notifications") as svc:
            svc.mark_all_read.return_value = 3
            controller.read_all(_request(), response)

        body = _body(response)
        self.assertEqual(body["cleared"], 3)
        self.assertEqual(body["unread"], 0)
