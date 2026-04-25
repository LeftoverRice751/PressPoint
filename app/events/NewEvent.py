from app.controllers.EventController import ShouldBroadcast

class NewEvent(ShouldBroadcast):
    def __init__(self, events):
        self.events = events
        
    def broadcast_on(self):
        return ["flash-updates-channel"]
    
    def broadcast_on(self):
        return {
            "title": self.events.title,
            "description": self.events.description,
            "location": self.events.location_id,
        }
