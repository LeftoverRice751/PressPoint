"""The CSP that backstops the archive reader's own pdf.js hardening.

The kiosk rasterises editor-uploaded PDFs. `kiosk-archive-book.js` already
disables annotations and XFA on that document, but those are one library's
options: a pdf.js upgrade that changes a default, or any other file-derived
markup reaching a page, should still hit a wall. These tests pin the parts of
the policy that would be easy to lose in a well-meaning edit -- particularly
object-src/frame-src, which are what actually stop a document being handed to
a plugin or a nested browsing context that would run it.
"""

from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from app.middlewares.SecurityHeadersMiddleware import SecurityHeadersMiddleware
from app.security_headers import CSP_HEADER, csp_nonce, new_nonce, policy_for


def _directives(policy):
    """{name: value} for the policy string, so tests assert on meaning rather
    than on the exact spacing and ordering of one long header."""
    out = {}
    for part in policy.split(";"):
        part = part.strip()
        if not part:
            continue
        name, _, value = part.partition(" ")
        out[name] = value
    return out


class PolicyTest(TestCase):
    def test_plugin_and_frame_vectors_are_closed(self):
        """The directives that answer "a malicious PDF" directly.

        object-src 'none' forbids <embed>/<object>, i.e. handing the file to a
        browser plugin that would run its scripting engine instead of letting
        pdf.js rasterise it. frame-src/frame-ancestors are 'self', not 'none'
        or '*': the kiosk hub frames /kiosk/latest-news as its attract screen,
        so same-origin framing must be allowed, but a cross-origin page still
        cannot frame the CMS -- the clickjacking case frame-ancestors exists
        for.
        """
        d = _directives(policy_for("abc"))
        self.assertEqual(d["object-src"], "'none'")
        self.assertEqual(d["frame-src"], "'self'")
        self.assertEqual(d["frame-ancestors"], "'self'")
        self.assertEqual(d["base-uri"], "'self'")

    def test_script_src_allows_no_inline_and_no_eval(self):
        """The whole point of the nonce is that 'unsafe-inline' is absent.

        'wasm-unsafe-eval' is expected and is NOT eval: it permits WebAssembly
        compilation only, which pdf.js 5 needs to decode JPEG2000/JBIG2.
        """
        script_src = _directives(policy_for("abc"))["script-src"]
        self.assertIn("'nonce-abc'", script_src)
        self.assertNotIn("'unsafe-inline'", script_src)
        self.assertNotIn("'unsafe-eval'", script_src)
        self.assertIn("'wasm-unsafe-eval'", script_src)

    def test_pdfjs_and_reader_runtime_requirements_are_present(self):
        """Guards the directives whose absence breaks the archive reader:
        its worker, and the blob: URLs it hands rasterised pages around as."""
        d = _directives(policy_for("abc"))
        self.assertIn("blob:", d["worker-src"])
        self.assertIn("blob:", d["img-src"])

    def test_nonces_are_unique_and_long_enough(self):
        """A nonce reused across responses is no nonce at all -- injected
        markup could carry the previous request's value."""
        nonces = {new_nonce() for _ in range(50)}
        self.assertEqual(len(nonces), 50)
        self.assertGreaterEqual(len(nonces.pop()), 16)


class MiddlewareTest(TestCase):
    class _Req:
        pass

    class _Resp:
        def __init__(self):
            self.headers = {}

        def header(self, name, value=None):
            self.headers[name] = value

    def test_before_mints_a_nonce_that_after_puts_in_the_header(self):
        mw = SecurityHeadersMiddleware()
        request, response = self._Req(), self._Resp()

        mw.before(request, response)
        mw.after(request, response)

        self.assertTrue(request.csp_nonce)
        self.assertIn(f"'nonce-{request.csp_nonce}'", response.headers[CSP_HEADER])

    def test_a_broken_response_never_takes_the_request_down(self):
        """A missing header is a lost defence-in-depth layer; an exception here
        would be a 500 on a public terminal."""

        class Exploding:
            def header(self, *a, **k):
                raise RuntimeError("boom")

        mw = SecurityHeadersMiddleware()
        request = self._Req()
        mw.before(request, None)
        self.assertIsNotNone(mw.after(request, Exploding()))


class TemplateHelperTest(TestCase):
    """csp_nonce() resolves through the container like app/tab_slots.py's
    current_slot(), so these patch the facade with an explicit stand-in --
    patch() cannot build an autospec of a Masonite facade, whose metaclass
    __getattr__ resolves every attribute out of the container.
    """

    def test_csp_nonce_reads_the_request(self):
        with patch("masonite.facades.Request", SimpleNamespace(csp_nonce="xyz")):
            self.assertEqual(csp_nonce(), "xyz")

    def test_csp_nonce_is_empty_outside_a_request(self):
        """The unit tests that render dashboard templates directly have no
        request bound, and neither does a console command; the helper must
        render an ignorable nonce="" rather than raise."""

        class Unbound:
            def __getattr__(self, name):
                raise RuntimeError("request key was not found in the container")

        with patch("masonite.facades.Request", Unbound()):
            self.assertEqual(csp_nonce(), "")

    def test_a_non_string_nonce_is_not_spliced_into_the_policy(self):
        """Belt and braces: whatever the container hands back, the header must
        stay a well-formed string."""
        with patch("masonite.facades.Request", SimpleNamespace(csp_nonce=object())):
            self.assertEqual(csp_nonce(), "")
