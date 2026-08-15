"""Cache-busting stamps for the compiled assets under `/assets/`.

nginx serves that tree with `expires 7d` (see `deploy/nginx-presspoint.conf`)
and the templates write the paths by hand, so nothing in a URL changes when
laravel-mix rebuilds a file. A returning browser therefore keeps running the
bundle it cached — for up to a week — against HTML that is rendered fresh on
every request.

That combination silently broke the Org Board: its buttons moved to `<dialog>`
markup (`data-ob-member-modal-open`) while browsers still held the previous
bundle, which only knew the old inline panel (`data-ob-panel`). The cached JS
bound selectors that no longer existed, so no click handler was ever attached.
Nothing errored — the buttons simply did nothing.

Stamping the file's mtime into the query string fixes that without giving up
the long cache: the URL changes exactly when the file does, and not otherwise.

`npm run prod` can hash filenames instead, but the templates link assets by
hand rather than through a manifest, so nothing would consume those hashes.

Used from templates as the `asset_url` global, registered in
`AppProvider.register()`:

    <script src="{{ asset_url('js/org-board-editor.js') }}" defer></script>
"""

import os
from pathlib import Path


#: Where the compiled bundles land, matching the `storage/compiled` -> `assets/`
#: entry in `config/filesystem.py`'s STATICFILES and the nginx alias.
COMPILED_ROOT = Path(__file__).resolve().parents[2] / "storage" / "compiled"

#: The URL prefix that root is served at.
ASSET_PREFIX = "/assets/"


def asset_url(path):
    """Return `/assets/<path>?v=<mtime>` for a compiled asset.

    The stamp is the file's modification time as a whole number of seconds,
    which changes on every rebuild and never on its own.

    A path that does not resolve to a real file is returned unstamped rather
    than raising: a mistyped or not-yet-built filename should cost a missing
    stylesheet, not a 500 on every page that links it. The same fallback covers
    a path trying to escape the compiled root.
    """
    relative = str(path or "").lstrip("/")
    url = ASSET_PREFIX + relative
    if not relative:
        return url

    target = (COMPILED_ROOT / relative).resolve()

    # Containment check before touching the filesystem: `asset_url` is only
    # ever called with literals today, but a caller that ever passes user
    # input must not be able to stat its way around the tree.
    try:
        target.relative_to(COMPILED_ROOT.resolve())
    except ValueError:
        return url

    try:
        return "%s?v=%d" % (url, os.stat(target).st_mtime)
    except OSError:
        # Not built yet, or removed. Serve the bare path.
        return url
