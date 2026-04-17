from masonite.exceptions import ExceptionHandler
from masonite.response import ThrottleRequestsException

class Handler(ExceptionHandler):
    
    def handle(self, exception):
        if isinstance(exception, ThrottleRequestsException):
            return self.response("Too many requests. Please try again later.", status=429)
        
        return super().handle(exception)