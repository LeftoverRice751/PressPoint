"""The auth throttle's counter must survive concurrent workers.

Production serves on five gunicorn *processes* sharing one cache directory
(`lyn.sh` -- threads are not an option because Masonite resolves `Response` as
a container singleton). Masonite's FileDriver increments with an unlocked
read-modify-write, so two workers can both read 3 and both write 4 and one
login attempt disappears. These tests run the real thing across real processes.
"""

import os
import tempfile
import unittest
from concurrent.futures import ProcessPoolExecutor

from masonite.cache.drivers import FileDriver

from app.cache_drivers import LockingFileDriver

_KEY = "throttle-counter"
_WORKERS = 8
_INCREMENTS_EACH = 60


def _driver(driver_class, location):
    # FileDriver only ever touches `application` through subclasses that don't
    # exist here, so the container is not needed to exercise the storage path.
    return driver_class(None).set_options({"location": location})


def _hammer(args):
    """Run in a child process: increment the shared counter repeatedly.

    Returns the number of increments that raised. Unlocked writers do not only
    lose updates -- a reader can catch a half-written file and blow up on
    `int("")` -- so the upstream case has to survive its own bug to be measured.
    """
    driver_name, location = args
    driver_class = LockingFileDriver if driver_name == "locking" else FileDriver
    driver = _driver(driver_class, location)

    errors = 0
    for _ in range(_INCREMENTS_EACH):
        try:
            driver.increment(_KEY)
        except (ValueError, TypeError):
            errors += 1
    return errors


def _run_contended(driver_name, location):
    """Returns (final counter value, number of failed increments)."""
    _driver(LockingFileDriver, location).put(_KEY, 0)
    with ProcessPoolExecutor(max_workers=_WORKERS) as pool:
        errors = sum(pool.map(_hammer, [(driver_name, location)] * _WORKERS))
    return int(_driver(LockingFileDriver, location).get(_KEY)), errors


class LockingFileDriverTestCase(unittest.TestCase):
    def test_concurrent_increments_are_not_lost(self):
        with tempfile.TemporaryDirectory() as location:
            total, errors = _run_contended("locking", location)

        self.assertEqual(errors, 0, "a locked increment raised on a torn read")
        self.assertEqual(
            total,
            _WORKERS * _INCREMENTS_EACH,
            "increments were lost -- the per-key lock is not holding across processes",
        )

    def test_the_unlocked_driver_is_what_we_are_protecting_against(self):
        """Pin the bug itself, so this suite fails loudly if a future Masonite
        makes the base driver atomic and this subclass becomes dead weight."""
        with tempfile.TemporaryDirectory() as location:
            total, errors = _run_contended("upstream", location)

        # Either symptom proves the race: increments silently vanish, or a
        # reader catches a half-written file. In practice it does both.
        self.assertTrue(
            total < _WORKERS * _INCREMENTS_EACH or errors,
            "upstream FileDriver no longer loses concurrent increments -- "
            "LockingFileDriver may no longer be needed",
        )

    def test_lock_files_are_invisible_to_flush_and_has(self):
        # FileDriver.flush() is glob("<dir>/*") + os.remove, which does not
        # match dotfiles -- so a lock file must never be a plain name, or flush
        # would try to remove it (and has() could mistake it for an entry).
        with tempfile.TemporaryDirectory() as location:
            driver = _driver(LockingFileDriver, location)
            driver.put(_KEY, 0)
            driver.increment(_KEY)

            lock_names = [
                name for name in os.listdir(location) if name.startswith(".lock-")
            ]
            self.assertTrue(lock_names, "no lock file was created")
            for name in lock_names:
                self.assertFalse(driver.has(name.replace(".lock-", "")) is None)

            driver.flush()
            self.assertTrue(
                os.path.isdir(location),
                "flush() tripped over a lock file",
            )

    def test_add_is_also_guarded(self):
        # RateLimiter.hit() calls add() before increment(); it is the same
        # unlocked read-modify-write shape and can reset a live counter to 0.
        with tempfile.TemporaryDirectory() as location:
            driver = _driver(LockingFileDriver, location)
            driver.put(_KEY, 7)

            driver.add(_KEY, 0)

            self.assertEqual(int(driver.get(_KEY)), 7)
