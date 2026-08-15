from masonite.providers import Provider
from masonite.facades import RateLimiter
from masonite.views import View

from app.rate_limiters import GuestAuthLimiter
from app.services import Branding
from app.services.AssetVersion import asset_url
from app.services.ImageDerivatives import news_image


class AppProvider(Provider):
    def __init__(self, application):
        self.application = application

    def register(self):
        # Register the view filter at startup, NOT in boot(): boot() runs
        # per request inside the same provider loop that dispatches the route
        # and renders the view, and AppProvider is booted last — so a filter
        # added in boot() lands *after* the template has already rendered.
        # View.filter() only updates the view's _filters dict (load_template
        # re-applies it on every render), so it is safe to call here even
        # though the Jinja env doesn't exist yet.
        self.application.make(View).filter("news_image", news_image)

        # The site logo is needed by templates that share no controller —
        # kiosk pages, the dashboard, and the auth shell. Sharing the
        # *function* (not its result) means every render calls it fresh;
        # View._shared lives on the singleton, so sharing a value here
        # would freeze whatever the logo was at boot.
        self.application.make(View).share({"site_logo": Branding.logo_url})

        # Every <script>/<link> in the templates goes through this. nginx
        # caches /assets/ for 7 days and the paths are written by hand, so
        # without a stamp a rebuilt file keeps its old URL and returning
        # browsers never re-fetch it. That is what left the Org Board's
        # buttons inert in production: new markup, week-old JS. Shared as the
        # *function* so each render stats the file it is linking.
        #
        # Named asset_url, not asset: Masonite's ViewProvider already registers
        # an `asset(alias, filename)` helper that resolves filesystem disks.
        self.application.make(View).share({"asset_url": asset_url})

    def boot(self):
        # Named limiter used by the login / OTP routes as `throttle:auth`.
        # Per-client (see GuestAuthLimiter) so bad attempts can't lock everyone out.
        RateLimiter.register("auth", GuestAuthLimiter("5/minute"))
