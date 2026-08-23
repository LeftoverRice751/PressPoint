"""Structure the Group Values section for the kiosk's values pane.

The kiosk renders this section as three distinct objects — a three-column
group-values strip, the STUDENTS acrostic as a grid, and the pledge — but the
editor authors all of it as free Quill HTML in two `subsections` entries. Rather
than add columns for a layout that only one screen uses, the shapes are derived
here from the HTML the editor already writes.

Every parser degrades to None/[] instead of raising, and the template falls back
to rendering the raw sanitized HTML when a parse comes back empty. So an editor
who reformats the section gets a plainer pane, never a broken one or a 500.
"""

import re

_TAGS = re.compile(r"<[^>]+>")
_NBSP = " "


def _text(html):
    """Strip tags to plain text, normalising the &nbsp; Quill sprinkles in."""
    if not html:
        return ""
    return _TAGS.sub("", html).replace("&nbsp;", " ").replace(_NBSP, " ").strip()


def _blocks(html):
    """Split Quill HTML into the text of each <p>/<li>/<h*> block."""
    if not html:
        return []
    parts = re.split(r"</(?:p|li|h[1-6])>", html, flags=re.I)
    return [t for t in (_text(p) for p in parts) if t]


def group_values(html):
    """`Integrity (transparency, leadership, discipline)` -> name + qualities.

    Returns [{"name": "Integrity", "qualities": ["Transparency", ...]}, ...].
    Only blocks matching `Word (a, b, c)` count, which is what keeps the
    acrostic lines in the same field from being picked up as values.
    """
    out = []
    for block in _blocks(html):
        match = re.match(r"^([A-Za-z][A-Za-z ]{2,30}?)\s*\(([^)]+)\)\s*$", block)
        if not match:
            continue
        name = match.group(1).strip()
        qualities = [q.strip().capitalize() for q in match.group(2).split(",") if q.strip()]
        if name and qualities:
            out.append({"name": name, "qualities": qualities})
    return out


def acrostic(html, expected=None):
    """`<strong>S</strong> <em>pirited</em>` -> [{"letter": "S", "rest": "pirited"}].

    `expected` (e.g. "STUDENTS") filters to just that word's run, so the values
    section — which carries both the STUDENTS core values and the LSPU pledge
    in sibling fields — yields only the one asked for.
    """
    if not html:
        return []
    pairs = re.findall(
        r"<strong>\s*([A-Za-z])\s*</strong>\s*(?:&nbsp;|\s)*<em>\s*([A-Za-z]+)\s*</em>",
        html,
        flags=re.I,
    )
    items = [{"letter": letter.upper(), "rest": rest} for letter, rest in pairs]
    if expected:
        letters = "".join(i["letter"] for i in items)
        if letters != expected.upper():
            return []
    return items


def pledge_lines(html):
    """The pledge is `L ead in providing...` — one acrostic line per block.

    Returns [{"letter": "L", "rest": "ead in providing quality education..."}].
    Blocks that don't start with a lone capital are returned with letter None so
    the intro sentence ("We, the members of the Faculty and Staff...") survives.
    """
    out = []
    for block in _blocks(html):
        match = re.match(r"^([A-Z])\s+([a-z].*)$", block)
        if match:
            out.append({"letter": match.group(1), "rest": match.group(2)})
        else:
            out.append({"letter": None, "rest": block})
    return out


def split_statement(html):
    """Quality policy: the claim, then the commitment that follows it.

    The editor writes one paragraph; the kiosk sets the first sentence as a
    display pull-quote and the remainder as supporting copy. Splits on the
    "Thus," hinge and falls back to (whole, "") when it isn't there.
    """
    text = _text(html)
    if not text:
        return "", ""
    match = re.search(r"\bThus,\s*", text)
    if not match:
        return text, ""
    return text[: match.start()].strip(), text[match.start():].strip()


def hymn_lines(html):
    """Lyrics -> one entry per sung line.

    Handles both shapes the editor produces: separate <p> per line (what the
    live row uses) and one <p> with <br> between lines.
    """
    if not html:
        return []
    normalised = re.sub(r"<br\s*/?>", "</p><p>", html, flags=re.I)
    return _blocks(normalised)
