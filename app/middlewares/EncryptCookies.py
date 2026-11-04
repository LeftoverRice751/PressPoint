from masonite.exceptions import InvalidToken
from masonite.middleware import EncryptCookies as BaseEncryptCookies


class EncryptCookies(BaseEncryptCookies):
    """Masonite's cookie decryption, without its plaintext fallback.

    Upstream's before() catches InvalidToken and leaves the raw value in the jar,
    so the rest of the request reads it as if the app had written it. Sessions
    are cookies here (app/session_drivers.py) and the sign-in token is one too,
    so encryption is the only thing that makes those values trustworthy.

    Dropped from this request only, not deleted in the browser: third parties
    set cookies on this origin too (Cloudflare's __cf_bm), and those are never
    ours to decrypt or to clear.
    """

    def before(self, request, response):
        jar = request.cookie_jar
        for name, cookie in list(jar.all().items()):
            if not cookie.encrypt:
                continue

            try:
                cookie.value = request.app.make("sign").unsign(cookie.value)
            except InvalidToken:
                jar.loaded_cookies.pop(name, None)

        return request
