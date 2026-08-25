from masonite.providers import Provider
import roslibpy
import threading


class RosFusionProvider(Provider):
    def __init__(self, application):
        self.application = application
        self.client = None
        self.thread = None

    def register(self):
        self.client = roslibpy.Ros(host="127.0.0.1", port=80)
        self.application.bind('RosClient', self.client)

    def boot(self):
        def connect_ros():
            self.client.run()
            
        self.thread = threading.Thread(target=connect_ros)
        self.thread.daemon = True
        self.thread.start()
