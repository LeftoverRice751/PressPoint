from masonite.providers import Provider

from app.exceptions.Handler import Handler

class ExceptionProvider(Provider):
    def register(self):
        self.application.bind("exception.handler", Handler(self.application))