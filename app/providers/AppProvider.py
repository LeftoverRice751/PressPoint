from masonite.providers import Provider
from masonite.facades import RateLimiter
from masonite.views import View

from app.cache_drivers import LockingFileDriver
from app.exceptions.Handler import Handler
from app.exceptions.InvalidCSRFTokenHandler import InvalidCSRFTokenHandler
from app.rate_limiters import GuestAuthLimiter
from app.security_headers import csp_nonce
from app.session_drivers import SlotCookieSessionDriver
from app.tab_slots import current_slot
from app.services import Branding, Profiles
from app.services.AssetVersion import asset_url
from app.services.ImageDerivatives import news_image


class AppProvider(Provider):
    def __init__(self, application):
        self.application = application

    def register(self):
        # Replace the framework's "file" cache driver with the locking one.
        # CacheProvider registers its FileDriver under that name and runs
        # before AppProvider (see config/providers.py), so re-adding the name
        # here wins without touching config/cache.py -- `STORES["local"]` still
        # reads `"driver": "file"`.
        #
        # This is the store the auth throttle counts in, and production runs
        # five gunicorn processes against one cache directory. Upstream's
        # increment is an unlocked read-modify-write; see app/cache_drivers.py.
        self.application.make("cache").add_driver(
            "file", LockingFileDriver(self.application)
        )

        # Same trick as the cache driver above, one provider along: replace the
        # session "cookie" driver with the slot-aware one. SessionProvider
        # registers its CookieDriver under that name and runs before
        # AppProvider (config/providers.py), so re-adding the name wins without
        # touching config/session.py. Without it, two tabs share one flash bag
        # and an admin's success banner pops up in the editor's tab.
        self.application.make("session").add_driver(
            "cookie", SlotCookieSessionDriver(self.application)
        )

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

        # Staff identity helpers. Shared as functions for the same reason as
        # site_logo above: View._shared lives on the singleton, so sharing a
        # value would freeze one user's name and avatar into every subsequent
        # render — in a multi-worker, multi-editor app that means showing one
        # editor another editor's profile border.
        #
        # Registered here in register(), not boot(): boot() runs per request
        # after the template has already rendered.
        # The tab's sign-in slot, for shell.html's data-tab-slot. Shared as a
        # function, like the helpers below and for the same reason: a value
        # would freeze one request's slot into every later render, which in a
        # multi-worker app means handing one tab another tab's identity.
        self.application.make(View).share({"tab_slot": current_slot})

        # The per-request CSP script nonce, for the two inline <script> blocks
        # (kiosk-sw.html, kiosk-back.html). Shared as the *function* for the
        # same reason as everything else here: a value would freeze one
        # request's nonce into every later render, and a reused nonce is a
        # defeated nonce -- injected markup could simply carry it.
        self.application.make(View).share({"csp_nonce": csp_nonce})

        self.application.make(View).share({
            "display_name": Profiles.display_name,
            "avatar_url": Profiles.avatar_url,
            "user_initials": Profiles.initials,
        })

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
        # Named limiter used by the login route as `throttle:auth`.
        # Per-client (see GuestAuthLimiter) so bad attempts can't lock everyone out.
        RateLimiter.register("auth", GuestAuthLimiter("5/minute"))

        # The password reset flow used to share the `auth` bucket, and since the
        # throttle key is `limit_string + ip`, one honest reset spent three of
        # the five attempts (send code -> verify OTP -> set password). A resend
        # or a mistyped digit then tripped the limit on a first-time reset.
        # These two ends of the flow aren't a credential-guessing surface — the
        # cap is here to stop mail flooding — so they get their own, looser one.
        RateLimiter.register("password-reset", GuestAuthLimiter("10/minute"))

        # Code verification stays tight and stands alone: `verify_otp` matches a
        # token across the whole password_resets table rather than against the
        # requesting email, so this endpoint IS the brute-force surface. Its own
        # bucket means the full allowance is spent on guesses only — never on
        # the two requests that bracket it.
        RateLimiter.register("otp", GuestAuthLimiter("5/minute"))

        # Public, unauthenticated route-session minting (QR handoff to a phone).
        # Looser than auth since it's not a credential-guessing surface, but still
        # per-client so a script can't mint unlimited tokens/emails.
        RateLimiter.register("route-sessions", GuestAuthLimiter("10/minute"))

        # Public archive page rendering — a cache miss triggers PyMuPDF
        # rasterization, so this exists to cap CPU spend from a scripted hit on
        # unwarmed pages, not to slow down normal kiosk reading.
        RateLimiter.register("archive-pages", GuestAuthLimiter("30/minute"))
