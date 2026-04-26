class PlayVideo:
    """Broadcast / domain event when editorial triggers kiosk video playback."""

    def __init__(self, payload=None):
        self.payload = payload or {}
