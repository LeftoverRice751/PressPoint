"""Structure the Group Values section for the kiosk's values pane.

The kiosk renders this section as three distinct objects — a three-column
group-values strip, the STUDENTS acrostic as a grid, and the pledge — but the
editor authors all of it as free Quill HTML in two `subsections` entries. Rather
than add columns for a layout that only one screen uses, the shapes are derived
here from the HTML the editor already writes.

That was the plan; in practice the group values and the acrostic are now typed
into their own repeater rows (stored on the row's `meta`) and resolve() reads
those first. The parsers below remain for rows saved before the repeaters
existed, and for the pledge, which is still free Quill text.

Every parser degrades to None/[] instead of raising, and the template falls back
to rendering the raw sanitized HTML when a parse comes back empty. So an editor
who reformats the section gets a plainer pane, never a broken one or a 500.
"""

import re

_TAGS = re.compile(r"<[^>]+>")
_NBSP = "\u00a0"

#: Zero-width characters Quill leaves behind, and that anything pasted out of
#: Word brings with it. The live Core Values field stored its last acrostic
#: letter as `<strong>\ufeffS</strong>`, and U+FEFF is a *format* character, not
#: whitespace, so the `\s*` in ACROSTIC_RE below never matched it: the run
#: parsed as STUDENT, failed the STUDENTS check, and the entire Core Values
#: block silently vanished from the kiosk. They carry no meaning in this
#: content, so every parser here drops them before matching.
_ZERO_WIDTH = re.compile("[\ufeff\u200b\u200c\u200d\u2060]")


def _clean(html):
    """Drop zero-width characters. Safe on None/empty."""
    if not html:
        return ""
    return _ZERO_WIDTH.sub("", html)


def _text(html):
    """Strip tags to plain text, normalising the &nbsp; Quill sprinkles in."""
    if not html:
        return ""
    return _TAGS.sub("", _clean(html)).replace("&nbsp;", " ").replace(_NBSP, " ").strip()


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
        _clean(html),
        flags=re.I,
    )
    items = [{"letter": letter.upper(), "rest": rest} for letter, rest in pairs]
    if expected:
        # Find the *run* that spells `expected`, which is what the caller asked
        # for. This used to require the whole field to parse to exactly that
        # word, so one extra bolded-then-italic phrase anywhere in the section
        # -- a heading an editor styled, a stray emphasis -- blanked the entire
        # acrostic on the kiosk with nothing in its place.
        letters = "".join(i["letter"] for i in items)
        start = letters.find(expected.upper())
        if start == -1:
            return []
        return items[start:start + len(expected)]
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


def _letter_row(word):
    """`Spirited` -> {"letter": "S", "rest": "pirited"} for the acrostic grid."""
    return {"letter": word[:1].upper(), "rest": word[1:]}


def resolve(meta, subsections):
    """Everything the Values pane renders, from rows when we have them.

    `meta` is the merged values meta (AboutContent.meta_for). Its
    `group_values` / `core_values` are the editor's structured rows; a list,
    even an empty one, is authoritative. None means the row predates the
    repeaters, so the shapes are parsed out of the first Quill sub-block the
    way they always were -- except that the acrostic no longer has to spell
    STUDENTS to be shown, because hiding seven correct letters over one
    mis-formatted eighth is how the block kept vanishing.

    The pledge is the *last* sub-block once the rows exist: the old combined
    "Group Values & Core Values" block becomes redundant, and an editor who
    removes it must not promote the pledge into the core-values slot.
    """
    meta = meta or {}
    subs = [s for s in (subsections or []) if isinstance(s, dict)]
    stored_groups = meta.get("group_values")
    stored_core = meta.get("core_values")
    structured = isinstance(stored_groups, list) or isinstance(stored_core, list)

    if structured:
        core_html = ""
        pledge_html = (subs[-1].get("body_html") or "") if subs else ""
        groups = stored_groups if isinstance(stored_groups, list) else []
        words = stored_core if isinstance(stored_core, list) else []
        core_rows = [_letter_row(w) for w in words if w]
    else:
        core_html = (subs[0].get("body_html") or "") if len(subs) > 0 else ""
        pledge_html = (subs[1].get("body_html") or "") if len(subs) > 1 else ""
        groups = group_values(core_html)
        core_rows = acrostic(core_html, "STUDENTS") or acrostic(core_html)

    return {
        "structured": structured,
        "group_values": groups,
        "core_acrostic": core_rows,
        "core_words": [r["letter"] + r["rest"] for r in core_rows],
        "core_html": core_html,
        "pledge_html": pledge_html,
    }
