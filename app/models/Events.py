""" Events Model """

from masoniteorm.models import Model


class Events(Model):
    """Events Model"""

    # Keep this in step with the keywords EventController.store passes to
    # Events.create(). A column missing here is dropped *silently*: Masonite's
    # QueryBuilder.create runs the payload through Model.filter_fillable, which
    # rebuilds it as {x: d[x] for x in __fillable__ if x in d} -- no error, no
    # warning. That is how `event_image` went missing: every poster an editor
    # attached was written to the NAS and then orphaned, the row stored NULL,
    # and the dashboard's event view modal had no path to show.
    #
    # Mass assignment is safe for this list because store() builds its kwargs
    # explicitly from validated values, and the image path is produced
    # server-side by save_uploaded_image rather than taken from request input.
    __fillable__ = [
        "title",
        "description",
        "event_date",
        "location_id",
        "event_image",
        "is_archive",
    ]
