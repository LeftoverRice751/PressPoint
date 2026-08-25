"""Notification Model."""

from masoniteorm.models import Model


class Notification(Model):
    """A message addressed to one staff account, shown in the dashboard bell.

    Written directly rather than through masonite.notification: that package's
    database driver is configured against a `sqlite` connection (config/notification.py)
    while the app runs on MySQL, and nothing has ever exercised it. A row here
    is three fields and an insert; the package would be more machinery than the
    flow needs.

    `type` drives only the icon in the bell dropdown, so an unrecognised value
    degrades to the default icon rather than breaking the list.
    """

    __fillable__ = [
        "user_id",
        "type",
        "title",
        "message",
        "link",
        "read_at",
    ]
