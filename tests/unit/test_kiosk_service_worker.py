"""Guards on the kiosk's offline shell (resources/js/sw-kiosk.js).

The kiosk's "Kiosk menu" back button used to need the network. partials/
kiosk-back.html prefers history.back() so the menu is restored from the
bfcache, but that shortcut only fires when document.referrer matches the link
target -- not on a deep link, a QR entry or a redirect -- and a page holding an
open Pusher WebSocket is routinely evicted from the bfcache anyway. Those cases
fell through to a real GET /kiosk, which fails outright when the campus link is
down. sw-kiosk.js caches the shell so they don't.

Three things here are load-bearing and all fail silently if they rot:

  * The registration partial has to be on *every* kiosk document. Most kiosk
    templates are standalone <html> files that don't extend base.html, so there
    is no layout to hook and nothing structural stops one being forgotten. The
    sweep below is what catches that -- same idea as the sweep in
    test_asset_versioning.py.
  * The bypass list has to keep holding /pano/tiles/ (~360 MB of panorama
    imagery, which would blow the origin's storage quota by itself) and the two
    no-store polls. A caching worker that swallowed those would be worse than
    no worker at all.
  * The service worker must be mix.copy'd, not mix.js'd. Webpack's module
    wrapper turns a worker into a file that registers and then does nothing.
"""

import re
from pathlib import Path

from app.controllers.kiosk.WelcomeController import WelcomeController
from tests import TestCase

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SW = _REPO_ROOT / "resources" / "js" / "sw-kiosk.js"
_PARTIAL = _REPO_ROOT / "templates" / "partials" / "kiosk-sw.html"

#: Every kiosk document. welcome.html is the menu itself; the other six are the
#: destinations its feature cards point at. Keep this list in step with the
#: kiosk routes in routes/public.py.
_KIOSK_TEMPLATES = (
    "welcome.html",
    "kiosk/news.html",
    "kiosk/campus-map.html",
    "kiosk/archives.html",
    "kiosk/kiosk-tour.html",
    "kiosk/about-lspu.html",
    "kiosk/org-board.html",
)

#: Requests the worker must never answer from Cache Storage.
_MUST_BYPASS = (
    "/pano/tiles/",       # ~360 MB capture; quota suicide
    "/kiosk/flash-updates",  # polled every 15s, cache: no-store
    "/kiosk/idle-video",     # cache: no-store
    # The endpoint that exists precisely to be fresher than the cached document
    # that would otherwise have carried the token. Caching it restores the
    # staleness it was added to remove.
    "/kiosk/csrf",
)


class KioskServiceWorkerTestCase(TestCase):
    def test_the_worker_exists_and_is_a_plain_script(self):
        """mix.copy, not mix.js -- see the module docstring."""
        self.assertTrue(_SW.is_file(), "resources/js/sw-kiosk.js is missing")

        mix = (_REPO_ROOT / "webpack.mix.js").read_text(encoding="utf-8")
        self.assertIn(
            '"resources/js/sw-kiosk.js"',
            mix,
            "sw-kiosk.js is not built; nothing lands in storage/compiled/js/",
        )
        self.assertRegex(
            mix,
            r'mix\.copy\(\s*"resources/js/sw-kiosk\.js"',
            "sw-kiosk.js must be mix.copy'd -- mix.js wraps it in webpack's "
            "runtime, which breaks the worker",
        )

    def test_every_kiosk_template_registers_the_worker(self):
        """The sweep. One forgotten template is one page with no way home."""
        missing = [
            name
            for name in _KIOSK_TEMPLATES
            if "partials/kiosk-sw.html" not in
            (_REPO_ROOT / "templates" / name).read_text(encoding="utf-8")
        ]
        self.assertEqual(
            [],
            missing,
            f"kiosk templates missing the sw registration include: {missing}",
        )

    def test_the_worker_never_caches_the_forbidden_requests(self):
        source = _SW.read_text(encoding="utf-8")
        bypass = re.search(
            r"const BYPASS_PREFIXES = \[(.*?)\];", source, re.DOTALL
        )
        self.assertIsNotNone(bypass, "BYPASS_PREFIXES list not found")
        for prefix in _MUST_BYPASS:
            self.assertIn(
                prefix,
                bypass.group(1),
                f"{prefix} must stay in the service worker's bypass list",
            )

    def test_documents_may_only_be_cached_because_the_csrf_token_moved_out(self):
        """This inverts an earlier guard, so it records why.

        Kiosk documents used to be network-first for one reason: the markup
        carried a per-session CSRF token that the campus map and tour QR
        handoff POSTs read out of <meta name="csrf-token">, so a cached
        document would hand them a stale one and the POST would 500. That cost
        a full network round trip for HTML on every page entry, which is the
        dominant cost of opening a destination in welcome.html's stage
        viewport.

        The token now has its own always-fresh endpoint. Serving documents from
        cache is therefore safe -- but ONLY while that remains true, and the
        pieces are in three different files that no one edits together. So this
        asserts the whole chain rather than just the strategy: cache the
        documents if and only if nothing depends on their token.
        """
        source = _SW.read_text(encoding="utf-8")

        # 1. The strategy itself: cache before network in the navigation branch.
        nav = source.index("event.request.mode === 'navigate'")
        branch = source[nav:nav + 1600]
        self.assertLess(
            branch.index("cache.match(event.request"),
            branch.index("fetch(event.request)"),
            "kiosk navigations must be served from cache first",
        )
        # ...and the revalidation must actually be allowed to finish. Without
        # waitUntil the worker can be killed as soon as respondWith settles, so
        # the refresh never lands and the cache goes permanently stale --
        # stale-while-revalidate with the revalidate silently missing.
        self.assertIn(
            "event.waitUntil(network",
            branch,
            "the background refresh must be kept alive past respondWith",
        )

        # 2. The precondition: the endpoint exists, is a route, and is no-store.
        self.assertTrue(hasattr(WelcomeController, "csrf"))
        routes = (_REPO_ROOT / "routes" / "public.py").read_text(encoding="utf-8")
        self.assertIn('Route.get("/kiosk/csrf"', routes)

        controller = (
            _REPO_ROOT / "app" / "controllers" / "kiosk" / "WelcomeController.py"
        ).read_text(encoding="utf-8")
        csrf_body = controller[controller.index("def csrf"):controller.index("def coming_soon")]
        self.assertIn('response.header("Cache-Control", "no-store")', csrf_body)

        # 3. The consumers: both POST call sites must fall back to it rather
        #    than trusting the (possibly cached) meta tag alone.
        for name in ("kiosk-map.js", "kiosk-tour.js"):
            page = (_REPO_ROOT / "resources" / "js" / name).read_text(encoding="utf-8")
            self.assertIn(
                "/kiosk/csrf",
                page,
                f"{name} POSTs with a CSRF token but never refreshes it; a cached "
                "document would break its route-session handoff",
            )

    def test_editor_mutable_media_is_revalidated_rather_than_pinned(self):
        """/assets/ is cache-first because AssetVersion.py stamps every URL with
        ?v=<mtime>, so a rebuilt file is a different URL. The /storage/ media
        trees carry no such stamp, so cache-first pinned them for the life of
        the cache: an editor replacing the site logo or a news image never
        reached a terminal at all until someone bumped CACHE_NAME. They must
        stay out of the cache-first list."""
        source = _SW.read_text(encoding="utf-8")
        assets = re.search(r"const ASSET_PREFIXES = \[(.*?)\];", source, re.DOTALL)
        self.assertIsNotNone(assets, "ASSET_PREFIXES list not found")

        for prefix in ("/storage/Branding/", "/storage/About/", "/storage/news/"):
            self.assertNotIn(
                prefix,
                assets.group(1),
                f"{prefix} is editor-mutable and unversioned; cache-first pins it forever",
            )
            self.assertIn(prefix, source, f"{prefix} must still be cached, just revalidated")

        # Archives are the exception and must stay cache-first: a published
        # issue's rasterised pages never change, and there are hundreds of MB
        # of them that must not be re-fetched.
        self.assertIn("/storage/Archives/", assets.group(1))

    def test_the_panorama_preview_carve_out_survives_the_bypass(self):
        """/pano/tiles/ is bypassed wholesale (362 MB), but preview.jpg is the
        low-resolution cube Marzipano paints the instant you enter a scene, and
        all 205 of them together are only ~20 MB. The carve-out has to be
        tested BEFORE the bypass or the prefix swallows it, which would look
        exactly like it working while caching nothing."""
        source = _SW.read_text(encoding="utf-8")
        self.assertIn("PANO_PREVIEW", source)

        carve_out = source.index("const isPanoPreview")
        bypass_check = source.index("startsWithAny(url.pathname, BYPASS_PREFIXES)) return;")
        self.assertLess(
            carve_out,
            bypass_check,
            "the preview carve-out must be computed before the bypass returns",
        )

    def test_the_worker_is_served_from_the_site_root_with_root_scope(self):
        """A worker's scope is capped at the directory it is served from, so
        serving this out of /assets/ would leave it unable to control /kiosk.
        The route + Service-Worker-Allowed header are what grant root scope."""
        self.assertTrue(hasattr(WelcomeController, "serve_sw"))

        routes = (_REPO_ROOT / "routes" / "public.py").read_text(encoding="utf-8")
        self.assertIn('Route.get("/sw-kiosk.js"', routes)
        self.assertIn("kiosk.WelcomeController@serve_sw", routes)

        controller = (
            _REPO_ROOT / "app" / "controllers" / "kiosk" / "WelcomeController.py"
        ).read_text(encoding="utf-8")
        serve_sw = controller[controller.index("def serve_sw"):]
        self.assertIn('response.header("Service-Worker-Allowed", "/")', serve_sw)
        # Without no-store, nginx's `expires 7d` on /assets/ would pin browsers
        # to an old worker for up to a week after a deploy.
        self.assertIn('response.header("Cache-Control", "no-store")', serve_sw)

    def test_the_kiosk_and_phone_surfaces_register_different_workers(self):
        """sw-kiosk.js and sw-archives.js both claim scope /, so a device must
        run exactly one of them. The kiosk archives page moved to sw-kiosk.js
        (which absorbed the /storage/Archives/ block); /m/archives keeps
        sw-archives.js, and the partial unregisters the stale one."""
        kiosk = (_REPO_ROOT / "resources" / "js" / "kiosk-archives.js").read_text(
            encoding="utf-8"
        )
        self.assertIn("register('/sw-kiosk.js'", kiosk)
        self.assertNotIn("register('/sw-archives.js'", kiosk)

        mobile = (_REPO_ROOT / "resources" / "js" / "mobile-archives.js").read_text(
            encoding="utf-8"
        )
        self.assertIn("register('/sw-archives.js'", mobile)

        partial = _PARTIAL.read_text(encoding="utf-8")
        self.assertIn("/sw-archives.js", partial)
        self.assertIn("unregister()", partial)

    def test_the_worker_still_caches_the_archive_pages_it_took_over(self):
        """kiosk-archives.js stopped registering sw-archives.js, so if this
        block hadn't moved across the archive reader would have silently lost
        its offline page cache on the kiosk."""
        self.assertIn("/storage/Archives/", _SW.read_text(encoding="utf-8"))
