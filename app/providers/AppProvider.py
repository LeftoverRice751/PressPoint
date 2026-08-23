from masonite.providers import Provider
from masonite.facades import RateLimiter
from masonite.views import View

from app.exceptions.Handler import Handler
from app.exceptions.InvalidCSRFTokenHandler import InvalidCSRFTokenHandler
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

        # Dispatched by masonite.exceptions.ExceptionHandler.handle(), which
        # looks up a container binding named exactly f"{ExceptionClass}Handler"
        # before falling back to its generic 500/debug-page path — see
        # InvalidCSRFTokenHandler's own docstring for why this one exists.
        self.application.bind(
            "InvalidCSRFTokenHandler", InvalidCSRFTokenHandler(self.application)
        )

        # Wrap the framework's exception_handler (bound by the core
        # ExceptionProvider, which registers before AppProvider) so every
        # unhandled exception is logged before falling through to the normal
        # 500/debug rendering. See app/exceptions/Handler.py for why this was
        # missing.
        default_handler = self.application.make("exception_handler")
        logging_handler = Handler(self.application)
        logging_handler.drivers = default_handler.drivers
        logging_handler.driver_config = default_handler.driver_config
        self.application.bind("exception_handler", logging_handler)

    def boot(self):
        # Named limiter used by the login / OTP routes as `throttle:auth`.
        # Per-client (see GuestAuthLimiter) so bad attempts can't lock everyone out.
        RateLimiter.register("auth", GuestAuthLimiter("5/minute"))

        # Public, unauthenticated route-session minting (QR handoff to a phone).
        # Looser than auth since it's not a credential-guessing surface, but still
        # per-client so a script can't mint unlimited tokens/emails.
        RateLimiter.register("route-sessions", GuestAuthLimiter("10/minute"))

        # Public archive page rendering — a cache miss triggers PyMuPDF
        # rasterization, so this exists to cap CPU spend from a scripted hit on
        # unwarmed pages, not to slow down normal kiosk reading.
        RateLimiter.register("archive-pages", GuestAuthLimiter("30/minute"))
