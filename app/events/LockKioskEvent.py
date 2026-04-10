from masonite.events import Event

class LockKioskEvent(Event):
    def __init__(self, status):
        self.status = status
        
    def broadcast_on(self):
        return ["kiosk-channel"]
    
    def broadcast_with(self):
        return {"status": self.status}

    def broadcast_as(self):
        return "app.events.LockKioskEvent"