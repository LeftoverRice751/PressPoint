"""The password card's markup contract: the three inputs the controller reads,
with the autocomplete hints that keep password managers filling the right
box, posting to the named route so a plain form submit still works."""

import re
from pathlib import Path
from unittest import TestCase

PARTIAL = (
    Path(__file__).resolve().parents[2]
    / "templates" / "gears" / "partials" / "profile-panel.html"
)


class ProfilePasswordFormTestCase(TestCase):
    def setUp(self):
        self.source = PARTIAL.read_text(encoding="utf-8")

    def _input(self, name):
        match = re.search(rf'<input[^>]*name="{name}"[^>]*>', self.source)
        self.assertIsNotNone(match, f"no <input name={name}>")
        return match.group(0)

    def test_current_password_field(self):
        tag = self._input("current_password")
        self.assertIn('type="password"', tag)
        self.assertIn('autocomplete="current-password"', tag)

    def test_new_password_fields(self):
        for name in ("password", "password_confirmation"):
            tag = self._input(name)
            self.assertIn('type="password"', tag)
            self.assertIn('autocomplete="new-password"', tag)

    def test_form_posts_to_the_named_route(self):
        self.assertIn("route('profile.password'", self.source)
        self.assertIn("data-profile-password-form", self.source)
