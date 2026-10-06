"""The modal layout contract, pinned across every dialog on both surfaces.

Every pop-up on the dashboard is a native <dialog> sharing `.article-modal`.
For a long time the shared panel declared only its skin -- no max-height, no
overflow, no display -- which left the UA's `dialog:modal { max-height:
calc(100% - 6px - 2em); overflow: auto }` as the scroller. Header, body and
footer scrolled as one block, so on a 768px-tall laptop "Save Event", "Save
member" and "Done" sat below the fold and an editor had to scroll a dialog to
finish the job.

The fix is structural, not cosmetic: `.article-modal__panel` is a height-capped
flex column and `.article-modal__body` is the only scroller, which leaves the
header and the footer pinned. That only holds while the MARKUP keeps the footer
OUT of the body -- nest it back inside and the CSS silently returns to scrolling
the buttons away, with nothing raising and no test failing. That is the
regression this file exists to catch.

The accessible-name assertion rides along for the same reason: five of these
dialogs had no `aria-labelledby` and no `id`, so a screen reader announced them
as "dialog" and nothing anywhere said so.

Rendering goes through the View facade, like test_account_templates.py, so the
assertions run against the markup the controllers genuinely emit rather than a
hand-written fixture.
"""

from html.parser import HTMLParser

from masonite.facades import View
from unittest.mock import Mock

from app.services import DashboardContext
from tests import TestCase
from tests.unit.test_account_templates import _EmptyBag


# HTML5 void elements. Without these the parser never closes an <input> and
# every field in a form swallows the rest of the dialog into itself.
VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}


class _Node:
    def __init__(self, tag, attrs, parent):
        self.tag = tag
        self.attrs = dict(attrs)
        self.parent = parent
        self.children = []
        self.classes = set((self.attrs.get("class") or "").split())

    def descendants(self):
        for child in self.children:
            yield child
            for node in child.descendants():
                yield node

    def find_all(self, tag=None, css_class=None):
        return [
            node for node in self.descendants()
            if (tag is None or node.tag == tag)
            and (css_class is None or css_class in node.classes)
        ]

    def has_ancestor_with_class(self, css_class, stop_at):
        node = self.parent
        while node is not None and node is not stop_at:
            if css_class in node.classes:
                return True
            node = node.parent
        return False


class _Tree(HTMLParser):
    """Just enough of a DOM to ask "is this element inside that one?".

    A real parser would be better, but the project has no HTML dependency and
    this needs to answer exactly one question about nesting.
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = _Node("#document", [], None)
        self._open = self.root

    def handle_starttag(self, tag, attrs):
        node = _Node(tag, attrs, self._open)
        self._open.children.append(node)
        if tag not in VOID:
            self._open = node

    def handle_startendtag(self, tag, attrs):
        self._open.children.append(_Node(tag, attrs, self._open))

    def handle_endtag(self, tag):
        node = self._open
        while node is not self.root and node.tag != tag:
            node = node.parent
        if node is not self.root:
            self._open = node.parent

    @classmethod
    def parse(cls, html):
        tree = cls()
        tree.feed(html)
        return tree.root


def _user(role="editor"):
    return Mock(
        id=3,
        username="jdelacruz",
        full_name="Juan Dela Cruz",
        avatar_path=None,
        role=role,
    )


class ModalLayoutContractTestCase(TestCase):
    """Applies to every `.article-modal` on both surfaces, current and future.

    Deliberately not a list of known dialog names: a new modal added without a
    body wrapper is exactly the regression, so the test has to find the dialogs
    itself rather than be told about them.
    """

    def _dashboard(self):
        context = DashboardContext.full_context("dashboard")
        context.update({
            "bag": _EmptyBag,
            "csrf_field": '<input type="hidden" name="__token" value="test">',
            "current_user": _user(),
            "is_admin": False,
            "unread_notifications": 0,
            "review_count": 0,
        })
        return View.render("gears/dashboard", context).rendered_template

    def _admin_console(self):
        context = DashboardContext.full_context("dashboard")
        context.update({
            "bag": _EmptyBag,
            "csrf_field": '<input type="hidden" name="__token" value="test">',
            "current_user": _user(role="admin"),
            "is_admin": True,
            "unread_notifications": 0,
            "editors": [],
            "stats": {},
            "review_stories": [],
            "review_count": 0,
            "review_issue": None,
            "review_issues": [],
        })
        return View.render("gears/admin-console", context).rendered_template

    def _modals(self, html):
        root = _Tree.parse(html)
        modals = [
            node for node in root.find_all(tag="dialog")
            if "article-modal" in node.classes
        ]
        self.assertTrue(modals, "no .article-modal dialogs found -- did the "
                                "render fail, or did the class get renamed?")
        return root, modals

    def _name_of(self, modal):
        """A readable identity for a failure message. These dialogs are
        addressed by data-* attribute, not by id, so that is what names them."""
        for key in modal.attrs:
            if key.startswith("data-") and key.endswith("modal"):
                return key
        for key in modal.attrs:
            if key.startswith("data-"):
                return key
        return " ".join(sorted(modal.classes))

    def _assert_footer_outside_body(self, html, surface):
        root, modals = self._modals(html)

        for modal in modals:
            name = self._name_of(modal)
            footers = modal.find_all(css_class="article-modal__footer")
            if not footers:
                # A dialog with no action bar (the read-only previews) has
                # nothing to scroll away; it only needs a body.
                continue

            bodies = modal.find_all(css_class="article-modal__body")
            self.assertTrue(
                bodies,
                "%s: %s has a footer but no .article-modal__body, so the whole "
                "panel scrolls and the buttons go with it" % (surface, name),
            )

            for footer in footers:
                self.assertFalse(
                    footer.has_ancestor_with_class(
                        "article-modal__body", stop_at=modal
                    ),
                    "%s: %s puts .article-modal__footer INSIDE "
                    ".article-modal__body -- the action buttons scroll with the "
                    "content again, which is the bug this contract exists to "
                    "prevent" % (surface, name),
                )

    def test_dashboard_footers_stay_out_of_the_scrolling_body(self):
        self._assert_footer_outside_body(self._dashboard(), "dashboard")

    def test_admin_console_footers_stay_out_of_the_scrolling_body(self):
        self._assert_footer_outside_body(self._admin_console(), "admin console")

    def test_every_modal_has_a_panel(self):
        """.article-modal__panel is where the height cap and the flex column
        live. A dialog without one inherits nothing and scrolls as a block."""
        for surface, html in (
            ("dashboard", self._dashboard()),
            ("admin console", self._admin_console()),
        ):
            _, modals = self._modals(html)
            for modal in modals:
                self.assertTrue(
                    modal.find_all(css_class="article-modal__panel"),
                    "%s: %s has no .article-modal__panel"
                    % (surface, self._name_of(modal)),
                )

    def test_every_modal_is_named_for_a_screen_reader(self):
        """Without aria-labelledby a <dialog> is announced as just "dialog".
        Five of these had no name and no id at all, and nothing said so."""
        for surface, html in (
            ("dashboard", self._dashboard()),
            ("admin console", self._admin_console()),
        ):
            root, modals = self._modals(html)
            ids = {
                node.attrs["id"] for node in root.descendants()
                if node.attrs.get("id")
            }

            for modal in modals:
                name = self._name_of(modal)
                labelled_by = modal.attrs.get("aria-labelledby")
                self.assertTrue(
                    labelled_by,
                    "%s: %s has no aria-labelledby" % (surface, name),
                )
                self.assertIn(
                    labelled_by, ids,
                    "%s: %s points aria-labelledby at \"%s\", which nothing in "
                    "the page carries as an id" % (surface, name, labelled_by),
                )
