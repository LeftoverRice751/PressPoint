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


class Handler(ExceptionHandler):
    def handle(self, exception):
        _logger.error(
            "%s: %s\n%s",
            exception.__class__.__name__,
            exception,
            "".join(traceback.format_exception(type(exception), exception, exception.__traceback__)),
        )
        return super().handle(exception)
