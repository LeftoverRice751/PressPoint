"""Guards on the cache-busting stamp every compiled asset URL carries.

nginx serves `/assets/` with `expires 7d` (deploy/nginx-presspoint.conf), and
the templates write those paths by hand. Without a stamp in the URL a rebuilt
file keeps its old address, so a returning browser runs whatever JS it cached
up to a week ago while the server sends freshly rendered HTML.

That is not hypothetical: the Org Board's "Add member" and "Manage
organizations" buttons were dead in production for exactly this reason. The
markup had moved to `<dialog>`s (`data-ob-member-modal-open`) while browsers
were still running the previous bundle, which only knew the old inline panel
(`data-ob-panel`). It bound selectors that no longer existed, so no handler was
ever attached — a click did nothing and the console stayed clean.

The sweep at the bottom is the important one: it is what stops the bug coming
back one forgotten `<script>` tag at a time.
"""

import os
import re
import tempfile
from pathlib import Path

from app.services.AssetVersion import COMPILED_ROOT, asset_url
from tests import TestCase


_TEMPLATES = Path(__file__).resolve().parents[2] / "templates"

#: Assets served from somewhere other than storage/compiled, so they carry no
#: build stamp. `/assets/` is the only tree this helper covers.
_UNVERSIONED_PREFIXES = ("/static/", "/storage/")


class AssetVersioningTestCase(TestCase):
    def test_a_compiled_asset_gets_a_version_stamp(self):
        url = asset_url("js/org-board-editor.js")

        self.assertTrue(
            re.fullmatch(r"/assets/js/org-board-editor\.js\?v=\d+", url),
            f"expected a stamped /assets path, got {url!r}",
        )

    def test_the_stamp_is_stable_while_the_file_is_untouched(self):
        # A stamp that moved on its own would defeat the 7-day cache entirely,
        # re-downloading every asset on every page load.
        self.assertEqual(
            asset_url("css/org-board.css"),
            asset_url("css/org-board.css"),
        )

    def test_the_stamp_changes_when_the_file_changes(self):
        # The whole point: a rebuild has to produce a different URL.
        handle, path = tempfile.mkstemp(suffix=".js", dir=str(COMPILED_ROOT))
        os.close(handle)
        relative = os.path.basename(path)
        try:
            before = asset_url(relative)
            stat = os.stat(path)
            os.utime(path, (stat.st_atime, stat.st_mtime + 60))
            after = asset_url(relative)

            self.assertNotEqual(before, after)
        finally:
            os.unlink(path)

    def test_a_missing_asset_falls_back_to_the_bare_path(self):
        # A mistyped or not-yet-built filename must not 500 the page it is on;
        # a missing stylesheet is a cosmetic bug, an exception is an outage.
        self.assertEqual(asset_url("js/never-built.js"), "/assets/js/never-built.js")

    def test_a_leading_slash_is_tolerated(self):
        self.assertEqual(
            asset_url("/js/org-board-editor.js"),
            asset_url("js/org-board-editor.js"),
        )

    def test_no_template_still_hardcodes_an_assets_path(self):
        # The sweep. Every /assets/ URL in a template must come from the
        # helper, or that one file silently keeps the stale-cache bug.
        offenders = []
        for template in sorted(_TEMPLATES.rglob("*.html")):
            for number, line in enumerate(template.read_text().splitlines(), 1):
                if "/assets/" not in line:
                    continue
                # The helper's own output is fine; a bare literal is not.
                for match in re.finditer(r"[\"'](/assets/[^\"']*)[\"']", line):
                    # The bare directory prefix is not a link to anything --
                    # asset_url() always yields a filename -- so it cannot
                    # carry a stale-cache bug. partials/kiosk-sw.html compares
                    # against it to decide what the service worker may cache.
                    if match.group(1) == "/assets/":
                        continue
                    offenders.append(
                        f"{template.relative_to(_TEMPLATES)}:{number} {match.group(1)}"
                    )

        self.assertEqual(
            offenders, [],
            "hardcoded /assets/ paths bypass the cache-busting stamp:\n  "
            + "\n  ".join(offenders),
        )

    def test_the_sweep_ignores_assets_served_outside_storage_compiled(self):
        # Sanity check on the guard above: /storage/ and /static/ are different
        # trees with different caching, and are not this helper's business.
        for prefix in _UNVERSIONED_PREFIXES:
            self.assertFalse(prefix.startswith("/assets/"))
