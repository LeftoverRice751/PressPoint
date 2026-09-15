"""Tap-to-sync lyric timings for the university hymn.

`about_sections.lyric_timings` is a JSON list, one `{start, end}` per sung
line, indexed by the line's position in the lyrics. The kiosk client has read
it since the hymn pane was built, but nothing ever wrote it: the column sat
NULL and the kiosk divided the track evenly across the lines, which no sung
hymn actually follows (instrumental intro, a chorus faster than the verses, a
held last note).

The dashboard now records timings by tapping along with the uploaded video,
and posts them on the same "Save Hymn" form as the lyrics. That pairing is the
point: timings are matched to lines by index, so they have to travel with the
text they describe or a lyric edit leaves them describing the wrong lines.
"""

import re
from pathlib import Path

from tests import TestCase

from app.services.AboutContent import MAX_LYRIC_LINES, AboutContent

_REPO_ROOT = Path(__file__).resolve().parents[2]


class SanitiseLyricTimingsTestCase(TestCase):
    def test_well_formed_rows_pass_through_as_floats(self):
        out = AboutContent.sanitize_lyric_timings(
            [{"start": 8, "end": "14.5"}, {"start": 14.5, "end": None}]
        )
        self.assertEqual(out, [{"start": 8.0, "end": 14.5}, {"start": 14.5, "end": None}])

    def test_missing_end_is_stored_as_none(self):
        """The last line runs to the end of the track; the kiosk already
        treats a non-numeric `end` as "until the media ends"."""
        out = AboutContent.sanitize_lyric_timings([{"start": 3}])
        self.assertEqual(out, [{"start": 3.0, "end": None}])

    def test_non_list_payload_becomes_empty(self):
        for junk in (None, "", "[]", {"start": 1}, 42):
            self.assertEqual(AboutContent.sanitize_lyric_timings(junk), [])

    def test_row_without_numeric_start_is_dropped(self):
        out = AboutContent.sanitize_lyric_timings(
            [{"start": "soon", "end": 4}, {"end": 4}, "x", {"start": 2, "end": 5}]
        )
        self.assertEqual(out, [{"start": 2.0, "end": 5.0}])

    def test_negative_start_is_dropped(self):
        self.assertEqual(AboutContent.sanitize_lyric_timings([{"start": -1, "end": 2}]), [])

    def test_end_not_after_start_is_cleared(self):
        """A reversed or zero-length window would never highlight; treat it as
        open-ended rather than storing a line the kiosk can never reach."""
        out = AboutContent.sanitize_lyric_timings(
            [{"start": 5, "end": 5}, {"start": 7, "end": 6.5}]
        )
        self.assertEqual(out, [{"start": 5.0, "end": None}, {"start": 7.0, "end": None}])

    def test_nan_and_infinity_are_not_numbers(self):
        out = AboutContent.sanitize_lyric_timings(
            [{"start": float("nan"), "end": 2}, {"start": 1, "end": float("inf")}]
        )
        self.assertEqual(out, [{"start": 1.0, "end": None}])

    def test_caps_the_number_of_rows(self):
        rows = [{"start": i, "end": i + 1} for i in range(MAX_LYRIC_LINES + 10)]
        self.assertEqual(len(AboutContent.sanitize_lyric_timings(rows)), MAX_LYRIC_LINES)


class LyricTimingsWiringTestCase(TestCase):
    """The pieces that have to agree for a tap on the dashboard to reach the
    kiosk. Source-level, like the other About wiring tests, because the save
    endpoint needs a live row and the JS runs in a browser."""

    def test_save_endpoint_reads_the_posted_timings(self):
        src = (_REPO_ROOT / "app/controllers/kiosk/AboutController.py").read_text()
        self.assertIn('request.input("lyric_timings", None)', src)
        self.assertIn("sanitize_lyric_timings", src)

    def test_hymn_form_carries_the_timings_input(self):
        """On the *lyrics* form, not a form of its own -- see the module doc."""
        src = (_REPO_ROOT / "templates/gears/partials/panel-about-lspu.html").read_text()
        form = re.search(
            r'data-section-form="hymn".*?</form>', src, flags=re.S
        ).group(0)
        self.assertIn('name="lyric_timings"', form)
        self.assertIn("data-hymn-sync", form)

    def test_hymn_form_offers_the_uploaded_media_to_tap_along_to(self):
        src = (_REPO_ROOT / "templates/gears/partials/panel-about-lspu.html").read_text()
        self.assertIn("data-hymn-sync-media", src)
        self.assertIn("section.video_path", src.split("data-hymn-sync")[1][:2000])
