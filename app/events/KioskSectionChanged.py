from masonite.events import Event


class KioskSectionChanged(Event):
    """A kiosk section's content changed; the terminal should re-fetch it.

    The payload is a signal, never content: the kiosk re-fetches from the
    server on receipt, so a dropped, duplicated or reordered event can never
    render anything wrong. That is also why the channel is public.
    """

    def __init__(self, section, stamp):
        self.section = section
        self.stamp = stamp

    def broadcast_on(self):
        return ["kiosk-content"]

    def broadcast_with(self):
        return {"section": self.section, "stamp": self.stamp}

    def broadcast_as(self):
        return "app.events.KioskSectionChanged"
