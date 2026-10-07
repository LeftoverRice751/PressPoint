"""Group values and core values as editor rows, not parsed Quill markup.

The kiosk's Values pane used to be regex-parsed out of one rich-text box: group
values from `Word (a, b, c)` paragraphs, the STUDENTS acrostic from
`<strong>S</strong>&nbsp;<em>pirited</em>` pairs. The acrostic had to spell
STUDENTS exactly or it rendered nothing, and the raw-HTML fallback only fired
when the group values *also* failed -- so when an editor retyped the last row as
a bold heading (`<h3><strong>Skillful</strong></h3>`) the parse read STUDENT and
the whole Core Values block vanished from the kiosk with no error anywhere.

These pin the replacement: repeater rows on `meta`, sanitized server-side, read
first by AboutValues.resolve(), with the old parse kept only for rows that
predate them.
"""

from masonite.facades import View

from app.services import AboutValues
from app.services.AboutContent import (
    MAX_CORE_VALUES,
    MAX_GROUP_VALUES,
    SECTION_SLUGS,
    AboutContent,
)
from tests import TestCase
from tests.unit.test_about_panel_render import _EmptyBag, _meta, _Section


#: The Values field exactly as the live row stored it when the bug was reported.
BROKEN_LIVE_HTML = (
    "<h3><strong>Group Values</strong></h3>"
    "<p>Integrity (transparency, leadership, discipline)</p>"
    "<p>Professionalism (competence, collegiality, responsibility)</p>"
    "<p>Innovation (creativity, initiative, industry)</p><p>&nbsp;</p>"
    "<h3><strong>﻿Core Values&nbsp;</strong></h3><p>LSPU develops:</p>"
    "<p><strong>S</strong>&nbsp;<em>pirited</em></p>"
    "<p><strong>T</strong>&nbsp;<em>ransparent</em></p>"
    "<p><strong>U</strong>&nbsp;<em>pright</em></p>"
    "<p><strong>D</strong>&nbsp;<em>isciplines</em></p>"
    "<p><strong>E</strong>&nbsp;<em>fficient</em></p>"
    "<p><strong>N</strong>&nbsp;<em>oble</em></p>"
    "<p><strong>T</strong>&nbsp;<em>rustworthy</em></p>"
    "<h3><strong>Skillful</strong></h3>"
)
PLEDGE_HTML = "<p>We pledge:</p><p>L&nbsp;ead well</p>"
STUDENTS = [
    "Spirited", "Transparent", "Upright", "Disciplines",
    "Efficient", "Noble", "Trustworthy", "Skillful",
]


def _legacy_subs():
    return [
        {"heading": "Group Values & Core Values", "body_html": BROKEN_LIVE_HTML},
        {"heading": "Performance Pledge", "body_html": PLEDGE_HTML},
    ]


class SanitizeValuesRowsTestCase(TestCase):
    def test_group_values_split_typed_qualities_on_commas(self):
        cleaned = AboutContent.sanitize_meta("values", {"group_values": [
            {"name": " Integrity ", "qualities": "transparency,  leadership , ,discipline"},
        ]})
        self.assertEqual(cleaned["group_values"], [
            {"name": "Integrity", "qualities": ["transparency", "leadership", "discipline"]},
        ])

    def test_group_value_without_a_name_is_dropped(self):
        cleaned = AboutContent.sanitize_meta("values", {"group_values": [
            {"name": "", "qualities": "orphaned"}, "junk", {"name": "Innovation"},
        ]})
        self.assertEqual(cleaned["group_values"], [{"name": "Innovation", "qualities": []}])

    def test_core_values_strip_tags_blanks_and_non_strings(self):
        cleaned = AboutContent.sanitize_meta("values", {"core_values": [
            "<b>Spirited</b>", "  ", None, 7, "Transparent",
        ]})
        self.assertEqual(cleaned["core_values"], ["Spirited", "Transparent"])

    def test_row_counts_are_capped(self):
        cleaned = AboutContent.sanitize_meta("values", {
            "group_values": [{"name": "V%d" % i} for i in range(50)],
            "core_values": ["Word"] * 50,
        })
        self.assertEqual(len(cleaned["group_values"]), MAX_GROUP_VALUES)
        self.assertEqual(len(cleaned["core_values"]), MAX_CORE_VALUES)

    def test_an_empty_list_is_kept_but_a_missing_key_is_not_posted(self):
        cleaned = AboutContent.sanitize_meta("values", {"core_values": []})
        self.assertEqual(cleaned, {"core_values": []})

    def test_other_sections_cannot_store_them(self):
        self.assertEqual(AboutContent.sanitize_meta("mission", {"core_values": ["X"]}), {})

    def test_an_emptied_list_overrides_rather_than_falling_back(self):
        section = _Section("values", meta={"core_values": [], "group_values": []})
        merged = AboutContent.meta_for("values", section)
        self.assertEqual(merged["core_values"], [])
        self.assertEqual(merged["group_values"], [])

    def test_unsaved_rows_default_to_none_so_legacy_parse_runs(self):
        merged = AboutContent.meta_for("values", _Section("values"))
        self.assertIsNone(merged["core_values"])
        self.assertIsNone(merged["group_values"])


class ResolveValuesTestCase(TestCase):
    def test_rows_win_over_whatever_the_quill_box_says(self):
        meta = AboutContent.meta_for("values", _Section("values", meta={
            "group_values": [{"name": "Integrity", "qualities": ["Transparency"]}],
            "core_values": STUDENTS,
        }))
        out = AboutValues.resolve(meta, _legacy_subs())

        self.assertTrue(out["structured"])
        self.assertEqual("".join(r["letter"] for r in out["core_acrostic"]), "STUDENTS")
        self.assertEqual(out["core_acrostic"][-1], {"letter": "S", "rest": "killful"})
        self.assertEqual(out["group_values"], [{"name": "Integrity", "qualities": ["Transparency"]}])
        # Nothing parsed from the old box is rendered, raw or otherwise.
        self.assertEqual(out["core_html"], "")

    def test_any_word_is_rendered_not_only_students(self):
        out = AboutValues.resolve({"core_values": ["Brave", "Open"]}, [])
        self.assertEqual([r["letter"] for r in out["core_acrostic"]], ["B", "O"])

    def test_pledge_is_the_last_sub_block_once_rows_exist(self):
        # The editor removed the now-redundant combined block: the pledge must
        # not slide into the core-values slot and vanish from the footer.
        subs = [{"heading": "Performance Pledge", "body_html": PLEDGE_HTML}]
        out = AboutValues.resolve({"core_values": STUDENTS}, subs)
        self.assertEqual(out["pledge_html"], PLEDGE_HTML)

        out = AboutValues.resolve({"core_values": STUDENTS}, _legacy_subs())
        self.assertEqual(out["pledge_html"], PLEDGE_HTML)

    def test_legacy_row_no_longer_loses_the_whole_acrostic(self):
        # The reported bug: seven good letters and one bold heading used to
        # produce an empty acrostic *and* suppress the raw fallback.
        out = AboutValues.resolve(AboutContent.meta_for("values"), _legacy_subs())

        self.assertFalse(out["structured"])
        self.assertEqual(len(out["group_values"]), 3)
        self.assertEqual(
            "".join(r["letter"] for r in out["core_acrostic"]), "STUDENT"
        )
        self.assertEqual(out["core_words"][0], "Spirited")
        self.assertEqual(out["pledge_html"], PLEDGE_HTML)

    def test_empty_everything_is_empty_not_an_error(self):
        out = AboutValues.resolve(None, None)
        self.assertEqual(out["core_acrostic"], [])
        self.assertEqual(out["group_values"], [])
        self.assertEqual(out["pledge_html"], "")


class ValuesRowsPanelTestCase(TestCase):
    def _render_values(self, meta_overrides=None, subs=None, with_rows=True):
        meta = _meta({"values": meta_overrides or {}})
        sections = {slug: _Section(slug) for slug in SECTION_SLUGS}
        sections["values"] = _Section("values", subsections=subs or _legacy_subs())
        context = {
            "sections": sections,
            "ordered_slugs": SECTION_SLUGS,
            "milestones": [],
            "about_meta": meta,
            "about_page": meta["page"],
            "bag": _EmptyBag,
            "csrf_field": "",
        }
        if with_rows:
            context["about_values_rows"] = AboutValues.resolve(
                meta["values"], sections["values"].subsections
            )
        return View.render("gears/partials/panel-about-lspu", context).rendered_template

    def test_a_legacy_row_opens_prefilled_from_the_old_text(self):
        html = self._render_values()

        self.assertEqual(html.count("data-group-row"), 3)
        self.assertIn('value="Transparency, Leadership, Discipline"', html)
        self.assertEqual(html.count("data-core-row"), 7)
        self.assertIn('value="Trustworthy"', html)
        self.assertIn("data-add-core", html)
        self.assertIn("data-add-group", html)

    def test_saved_rows_render_one_input_per_word(self):
        html = self._render_values({"core_values": STUDENTS, "group_values": []})

        self.assertEqual(html.count('class="field__input js-core-word"'), 8)
        self.assertEqual(html.count("data-group-row"), 0)
        self.assertIn("data-core-preview>STUDENTS<", html)

    def test_the_panel_still_renders_without_the_rows_in_context(self):
        # The existing panel tests render without about_values_rows at all.
        self.assertIn("data-core-values", self._render_values(with_rows=False))
