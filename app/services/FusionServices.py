import roslibpy
from masonite.facades import Broadcast

class FusionService:
    def __init__(self, ros_client):
        self.client = ros_client
        self.topic = roslibpy.Topic(self.client, 'odometry/filtered', 'nav_msgs/Odometry')
    
    
    def start_listening(self):
        def handle_message(msg):
            position = msg['pose']['pose']['pose']
            orientation = msg['pose']['pose']['orientation']
            
            Broadcast.channel('wayfinding').send('location-update', {
                'lat': position['y'],
                'lon': position['x'],
                'heading': orientation['z']
            })
            
        self.topic.subscribe(handle_message)