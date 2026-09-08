"""Content-Security-Policy for the kiosk and the dashboard.

Why this exists: the kiosk is an unattended public terminal that renders
editor-uploaded PDFs through pdf.js. `resources/js/kiosk-archive-book.js`
already refuses the document's own active surface (annotations disabled, XFA
off), but that is one library's option bag -- a CSP is the layer that holds
even if a future pdf.js upgrade changes a default, or if some other
file-derived content finds its way into a page. Defence in depth, not a
replacement for the reader's own settings.

Rolled out as Content-Security-Policy-Report-Only first (see
REPORT_ONLY below). The browser evaluates the policy and logs violations
but blocks nothing, so a directive we got wrong shows up in the console
instead of as a dead panel on a terminal in a hallway. Flip REPORT_ONLY to
False to enforce.
"""

import secrets

# Header name is chosen from this. Report-Only means "tell me, don't block".
REPORT_ONLY = True

CSP_HEADER = (
    "Content-Security-Policy-Report-Only" if REPORT_ONLY else "Content-Security-Policy"
)

# The two cross-origin scripts kiosk pages load. Kept in one place because
# templates/partials/kiosk-sw.html carries the same pair in its CROSS_OK list
# for the service worker -- if you add a third, add it in both.
CDNJS = "https://cdnjs.cloudflare.com"
PUSHER_JS = "https://js.pusher.com"


def _policy(nonce: str) -> str:
    """The directive list, with this request's script nonce spliced in.

    Notes on the non-obvious entries:

    - 'wasm-unsafe-eval' is required by pdf.js 5, which decodes JPEG2000 and
      JBIG2 images through WebAssembly in its worker. Without it the reader
      loses those images. It permits WebAssembly compilation only -- it does
      NOT re-enable eval() or new Function(), which is why it exists as a
      separate token from 'unsafe-eval'.
    - worker-src needs blob: for the same library; pdf.js falls back to a
      blob-URL worker when the module worker cannot be constructed.
    - img-src and media-src need blob: because the archive reader hands
      rasterised pages to the page-flip adapters as blob URLs
      (URL.createObjectURL in kiosk-archive-book.js), and data: because the
      2.5D map layer embeds small markers inline.
    - style-src keeps 'unsafe-inline': Quill, Leaflet, OpenSeadragon and
      StPageFlip all set element.style at runtime, and there is no nonce
      mechanism for that. Scripts are the surface worth locking down; a
      style injection cannot execute here.
    - 'inline-speculation-rules' covers the <script type="speculationrules">
      block in templates/welcome.html. A nonce cannot be used there (the
      browser matches speculation rules against this token specifically), and
      without it an enforcing policy silently drops the kiosk's prefetch.
      The two <script type="application/json"> data blocks (org-board chart
      data, organization groups) need nothing: script-src does not apply to
      non-executable script types.
    - object-src 'none' is the directive that most directly answers "a
      malicious PDF": it forbids <embed>/<object>, i.e. handing a document
      to a plugin that would run it with its own scripting engine rather
      than rasterising it. Kept exactly 'none' -- unrelated to framing.
    - frame-src/frame-ancestors 'self': the kiosk hub at /kiosk frames
      /kiosk/latest-news as its idle attract screen, so both need to allow
      same-origin framing -- frame-src binds the framing document (the hub
      embedding an <iframe>), frame-ancestors binds the framed one (the
      newsletter page accepting being embedded). 'self' still stops the
      clickjacking case frame-ancestors exists for: a cross-origin page
      still cannot frame the CMS, only presspoint-gears.me can frame
      itself.
    """
    return "; ".join(
        [
            "default-src 'self'",
            "base-uri 'self'",
            "object-src 'none'",
            "frame-src 'self'",
            "frame-ancestors 'self'",
            "form-action 'self'",
            (
                f"script-src 'self' 'nonce-{nonce}' 'wasm-unsafe-eval' "
                f"'inline-speculation-rules' {CDNJS} {PUSHER_JS}"
            ),
            "worker-src 'self' blob:",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "media-src 'self' blob:",
            "font-src 'self'",
            "connect-src 'self' https://*.pusher.com wss://*.pusher.com",
        ]
    )


def new_nonce() -> str:
    """A fresh per-request nonce.

    token_urlsafe(16) is 128 bits, comfortably past the 128-bit floor the CSP
    spec asks for. It must be per-request and unguessable: a nonce reused
    across responses lets injected markup carry last request's value and
    execute.
    """
    return secrets.token_urlsafe(16)


def csp_nonce() -> str:
    """This request's script nonce, for templates.

    Resolves through the container rather than taking the request as an
    argument because Jinja calls it with none -- same reason and same shape
    as app/tab_slots.py:current_slot(). Returns "" outside a request (the
    unit tests that render templates directly), which renders a nonce="" the
    browser ignores; those renders are not served to anyone.
    """
    from masonite.facades import Request

    try:
        value = getattr(Request, "csp_nonce", "")
        return value if isinstance(value, str) else ""
    except Exception:
        return ""


def policy_for(nonce: str) -> str:
    """Public entry point used by the middleware and the tests."""
    return _policy(nonce)
