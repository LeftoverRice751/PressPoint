import logging
import logging.handlers
import os
import traceback

from masonite.exceptions.ExceptionHandler import ExceptionHandler
from masonite.utils.location import base_path

# app/exceptions/Handler.py used to do this (bound under the key
# "exception.handler"), but that key changed to "exception_handler" in a
# framework upgrade — the old override silently stopped taking effect and was
# removed as dead code, which is why unhandled exceptions since then leave no
# trace anywhere (storage/ has no logs). This restores it under the current
# key so a wrong-password-style 500 can actually be diagnosed from the file
# instead of only reproduced live.
_log_path = os.path.join(base_path(), "storage", "framework", "logs", "exceptions.log")
os.makedirs(os.path.dirname(_log_path), exist_ok=True)

_logger = logging.getLogger("presspoint.exceptions")
_logger.setLevel(logging.ERROR)
if not _logger.handlers:
    _handler = logging.handlers.RotatingFileHandler(
        _log_path, maxBytes=5 * 1024 * 1024, backupCount=3
    )
    _handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
    _logger.addHandler(_handler)


GENERIC_ERROR = "Something went wrong. Please try again."


class Handler(ExceptionHandler):
    def _hide_details(self, exception):
        """Masonite's production path answers an unexpected error with str(exception),
        so a JSON caller could read a database error or a file path. It's still logged.
        """
        if self.application.is_debug() or self.application.has(
            f"{exception.__class__.__name__}Handler"
        ):
            return
        if hasattr(exception, "is_http_exception") or hasattr(exception, "get_response"):
            return
        exception.get_status = lambda: 500
        exception.get_response = lambda: GENERIC_ERROR

    def handle(self, exception):
        _logger.error(
            "%s: %s\n%s",
            exception.__class__.__name__,
            exception,
            "".join(traceback.format_exception(type(exception), exception, exception.__traceback__)),
        )
        self._hide_details(exception)
        return super().handle(exception)
