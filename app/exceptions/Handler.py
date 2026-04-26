import traceback

from masonite.exceptions import ExceptionHandler
from masonite.response import ThrottleRequestsException

class Handler(ExceptionHandler):
    
    def handle(self, exception):
        if isinstance(exception, ThrottleRequestsException):
            return self.response("Too many requests. Please try again later.", status=429)

        traceback.print_exception(type(exception), exception, exception.__traceback__)
        return super().handle(exception)