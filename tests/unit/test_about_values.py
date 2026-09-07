"""AboutValues parses editor-authored Quill HTML into the shapes the kiosk
About panes render.

The inputs here are copied from the live `about_sections` rows, so these lock in
the real formatting the editor produces. Every parser must degrade to empty
rather than raise: the kiosk falls back to rendering the raw HTML, and a section
reformatted in the editor must never 500 the public page.
"""

import unittest

from app.services import AboutValues


CORE_HTML = (
    "<h3><strong>Group Values</strong></h3>"
    "<p>Integrity (transparency, leadership, discipline)</p>"
    "<p> Professionalism (competence, collegiality, responsibility)</p>"
    "<p> Innovation (creativity, initiative, industry)</p>"
    "<p>&nbsp;</p><h3><strong>Core Values&nbsp;</strong></h3><p>LSPU develops:</p>"
    "<p><strong>S</strong>&nbsp;<em>pirited</em></p>"
    "<p> <strong>T</strong>&nbsp;<em>ransparent</em></p>"
    "<p> <strong>U</strong>&nbsp;<em>pright</em></p>"
    "<p> <strong>D</strong>&nbsp;<em>isciplines</em></p>"
    "<p> <strong>E</strong>&nbsp;<em>fficient</em></p>"
    "<p> <strong>N</strong>&nbsp;<em>oble</em></p>"
    "<p> <strong>T</strong>&nbsp;<em>rustworthy</em></p>"
    "<p> <strong>S</strong>&nbsp;<em>killful</em></p>"
)

#: The Core Values field *exactly* as the live row stores it, zero-width
#: characters and all. CORE_HTML above is a tidied copy, which is why the suite
#: stayed green while the kiosk rendered no Core Values at all: the real row
#: carries a U+FEFF inside the last `<strong>` (`<strong>﻿S</strong>`, left
#: behind by Quill) and puts that final letter in an `<h3>` rather than a `<p>`.
#: U+FEFF is a format character, not whitespace, so `\s*` never matched it, the
#: run parsed as STUDENT, and the STUDENTS check blanked the whole grid.
LIVE_CORE_HTML = (
    "<h3><strong>Group Values</strong></h3>"
    "<p>Integrity (transparency, leadership, discipline)</p>"
    "<p>Professionalism (competence, collegiality, responsibility)</p>"
    "<p>Innovation (creativity, initiative, industry)</p>"
    "<p>&nbsp;</p>"
    "<h3><strong>﻿Core Values&nbsp;</strong></h3><p>LSPU develops:</p>"
    "<p><strong>S</strong>&nbsp;<em>pirited</em></p>"
    "<p><strong>T</strong>&nbsp;<em>ransparent</em></p>"
    "<p><strong>U</strong>&nbsp;<em>pright</em></p>"
    "<p><strong>D</strong>&nbsp;<em>isciplines</em></p>"
    "<p><strong>E</strong>&nbsp;<em>fficient</em></p>"
    "<p><strong>N</strong>&nbsp;<em>oble</em></p>"
    "<p><strong>T</strong>&nbsp;<em>rustworthy</em></p>"
    "<h3><strong>﻿S</strong>&nbsp;<em>killful</em></h3>"
)

PLEDGE_HTML = (
    "<p>We, the members of the Faculty and Staff of the University, do pledge and commit to:</p>"
    "<p> L&nbsp;ead in providing quality education to the communities;</p>"
    "<p> S&nbsp;erve motherland and humanity at all times;</p>"
    "<p> P&nbsp;erform with utmost fairness, honesty and accountability; and</p>"
    "<p> U&nbsp;ndertake our responsibilities in the pursuit of common goals and welfare</p>"
)


class GroupValuesTest(unittest.TestCase):
    def test_extracts_name_and_qualities(self):
        values = AboutValues.group_values(CORE_HTML)
        self.assertEqual([v["name"] for v in values],
                         ["Integrity", "Professionalism", "Innovation"])
        self.assertEqual(values[0]["qualities"],
                         ["Transparency", "Leadership", "Discipline"])

    def test_ignores_the_acrostic_lines_in_the_same_field(self):
        # Both the triad and the STUDENTS acrostic live in one subsection; only
        # the `Word (a, b, c)` lines are group values.
        self.assertEqual(len(AboutValues.group_values(CORE_HTML)), 3)

    def test_empty_input_is_empty_not_an_error(self):
        self.assertEqual(AboutValues.group_values(""), [])
        self.assertEqual(AboutValues.group_values(None), [])


class AcrosticTest(unittest.TestCase):
    def test_reads_the_students_acrostic(self):
        items = AboutValues.acrostic(CORE_HTML, "STUDENTS")
        self.assertEqual(len(items), 8)
        self.assertEqual("".join(i["letter"] for i in items), "STUDENTS")
        self.assertEqual(items[0], {"letter": "S", "rest": "pirited"})

    def test_expected_word_mismatch_yields_nothing(self):
        # Guards the template's fallback: if an editor rewrites the acrostic,
        # the grid is skipped and the raw HTML is rendered instead of a grid
        # that silently spells something else.
        self.assertEqual(AboutValues.acrostic(CORE_HTML, "EXCELLENT"), [])

    def test_no_markup_yields_nothing(self):
        self.assertEqual(AboutValues.acrostic("<p>Spirited, Transparent</p>"), [])

    def test_reads_the_acrostic_from_the_live_row_verbatim(self):
        # The bug this pins: a zero-width U+FEFF inside the last <strong> made
        # the run parse as STUDENT, so the kiosk rendered no Core Values grid
        # and -- because group_values did parse -- no raw fallback either. The
        # section was simply blank on the terminal, with nothing logged.
        items = AboutValues.acrostic(LIVE_CORE_HTML, "STUDENTS")

        self.assertEqual("".join(i["letter"] for i in items), "STUDENTS")
        self.assertEqual(items[-1], {"letter": "S", "rest": "killful"})

    def test_a_letter_in_a_heading_is_read_like_any_other(self):
        # The live row's final letter sits in <h3>, not <p>: an editor pressing
        # the heading button on one line must not drop it from the grid.
        self.assertEqual(
            len(AboutValues.acrostic(
                "<p><strong>S</strong>&nbsp;<em>pirited</em></p>"
                "<h3><strong>T</strong>&nbsp;<em>ransparent</em></h3>", "ST")),
            2,
        )

    def test_zero_width_characters_do_not_break_a_letter(self):
        for zw in ("﻿", "​", "‌", "‍", "⁠"):
            with self.subTest(zero_width=repr(zw)):
                html = "<p><strong>%sS</strong>&nbsp;<em>pirited</em></p>" % zw
                self.assertEqual(AboutValues.acrostic(html), [{"letter": "S",
                                                               "rest": "pirited"}])

    def test_finds_the_expected_run_among_other_emphasis(self):
        # `expected` is documented as filtering to that word's run. It was an
        # all-or-nothing equality check, so one extra bolded-then-italic phrase
        # anywhere in the field blanked the entire grid.
        html = (
            "<p><strong>Note</strong> <em>below</em></p>"
            "<p><strong>S</strong>&nbsp;<em>pirited</em></p>"
            "<p><strong>T</strong>&nbsp;<em>ransparent</em></p>"
        )
        items = AboutValues.acrostic(html, "ST")

        self.assertEqual([i["rest"] for i in items], ["pirited", "ransparent"])

    def test_a_genuinely_different_word_still_yields_nothing(self):
        # The permissive run search must not become "match anything": the
        # template's raw-HTML fallback depends on this returning empty.
        self.assertEqual(AboutValues.acrostic(LIVE_CORE_HTML, "EXCELLENT"), [])


class LiveRowRegressionTest(unittest.TestCase):
    """The other parsers must be unaffected by the zero-width cleanup."""

    def test_group_values_still_reads_three_from_the_live_row(self):
        values = AboutValues.group_values(LIVE_CORE_HTML)

        self.assertEqual([v["name"] for v in values],
                         ["Integrity", "Professionalism", "Innovation"])

    def test_the_acrostic_lines_are_still_not_group_values(self):
        self.assertEqual(len(AboutValues.group_values(LIVE_CORE_HTML)), 3)

    def test_zero_width_is_stripped_from_plain_text_output(self):
        # hymn_lines and pledge_lines route through the same helper, so a stray
        # U+FEFF would otherwise ride into a sung line on the kiosk.
        self.assertEqual(AboutValues.hymn_lines("<p>﻿Hail​ LSPU</p>"),
                         ["Hail LSPU"])


class PledgeTest(unittest.TestCase):
    def test_splits_letter_from_remainder(self):
        lines = AboutValues.pledge_lines(PLEDGE_HTML)
        letters = [line["letter"] for line in lines if line["letter"]]
        self.assertEqual(letters, ["L", "S", "P", "U"])

    def test_keeps_the_intro_sentence_unlettered(self):
        lines = AboutValues.pledge_lines(PLEDGE_HTML)
        self.assertIsNone(lines[0]["letter"])
        self.assertTrue(lines[0]["rest"].startswith("We, the members"))


class SplitStatementTest(unittest.TestCase):
    def test_splits_on_the_thus_hinge(self):
        html = (
            "<p>LSPU delivers quality education through responsive instruction. "
            "Thus, we commit to continually improve.</p>"
        )
        statement, support = AboutValues.split_statement(html)
        self.assertTrue(statement.endswith("responsive instruction."))
        self.assertTrue(support.startswith("Thus,"))

    def test_without_the_hinge_everything_is_the_statement(self):
        statement, support = AboutValues.split_statement("<p>One sentence only.</p>")
        self.assertEqual(statement, "One sentence only.")
        self.assertEqual(support, "")


class HymnLinesTest(unittest.TestCase):
    def test_paragraph_per_line(self):
        lines = AboutValues.hymn_lines("<p>First line,</p><p>Second line,</p>")
        self.assertEqual(lines, ["First line,", "Second line,"])

    def test_br_separated_lines(self):
        # The editor produces either shape depending on how the lyrics were
        # pasted; both have to yield one entry per sung line so the highlight
        # tracks the audio.
        lines = AboutValues.hymn_lines("<p>First line,<br>Second line,</p>")
        self.assertEqual(lines, ["First line,", "Second line,"])

    def test_empty_is_empty(self):
        self.assertEqual(AboutValues.hymn_lines(""), [])


if __name__ == "__main__":
    unittest.main()
