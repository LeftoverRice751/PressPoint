"""Cache drivers with atomic read-modify-write.

Production runs five gunicorn *processes* against one shared cache directory
(`lyn.sh`; the app cannot use threads because Masonite resolves `Response` as a
container singleton). Masonite's `FileDriver` implements both counter
operations as an unlocked read-modify-write:

    def add(self, key, value, seconds=None):
        exists = self.get(key)          # <-- another worker can write here
        if exists:
            return exists
        return self.put(key, str(value), seconds=seconds)

    def increment(self, key, amount=1):
        return self.put(key, str(int(self.get(key)) + amount))

Two workers handling simultaneous login attempts can therefore both read 3 and
both write 4, and one attempt vanishes. That matters because these are the
operations `RateLimiter.hit()` runs on every throttled request, so the lost
update is a *lost attempt* -- a burst of parallel requests is counted as fewer
than it was, which is precisely the shape of traffic the auth throttle exists
to stop. `app/middlewares/ThrottleRequestsMiddleware.py` documents the other
half of the limiter's story (the counter that outlived its window).

Note this is not fixed by switching the store to Redis: Masonite's `RedisDriver`
spells increment the same way -- `int(self.get(key)) + amount` followed by a
`put` -- rather than using Redis' atomic INCR, so it races too. The lock has to
come from our side either way, and a filesystem lock works today without
provisioning another service.

`fcntl.flock` is the right primitive here: the workers are processes on one
host sharing one directory, the locks are released by the kernel if a worker is
killed mid-request, and it costs one open() per counter write.
"""

import fcntl
import os
from contextlib import contextmanager

from masonite.cache.drivers import FileDriver


class LockingFileDriver(FileDriver):
    """`FileDriver` whose counter mutations hold a per-key exclusive lock."""

    #: Lock files live beside the entries they guard but start with a dot, so
    #: `FileDriver.flush()` -- which is `glob("<dir>/*")` + `os.remove` and does
    #: not match dotfiles -- neither deletes them nor trips over them, and
    #: `has()` cannot mistake one for a cache entry.
    _LOCK_PREFIX = ".lock-"

    def _lock_path(self, key):
        safe_key = "".join(
            character if character.isalnum() or character in "-_.:" else "_"
            for character in str(key)
        )
        return os.path.join(self._get_directory(), f"{self._LOCK_PREFIX}{safe_key}")

    @contextmanager
    def _key_lock(self, key):
        try:
            handle = open(self._lock_path(key), "a+")
        except OSError:
            # An unwritable cache directory is already fatal for the driver
            # itself; don't let acquiring the lock be the thing that reports it.
            yield
            return

        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        except OSError:
            # No advisory locking on this filesystem (some network mounts).
            # Degrade to upstream's behaviour rather than failing the request.
            handle.close()
            yield
            return

        try:
            yield
        finally:
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            finally:
                handle.close()

    def add(self, key, value, seconds=None):
        with self._key_lock(key):
            return super().add(key, value, seconds=seconds)

    def increment(self, key, amount=1):
        with self._key_lock(key):
            return super().increment(key, amount)

    def decrement(self, key, amount=1):
        with self._key_lock(key):
            return super().decrement(key, amount)
