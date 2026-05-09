from tests import TestCase

from app.services.AboutContent import AboutContent


class AboutContentSanitiseTestCase(TestCase):
    def test_strips_script_tags(self):
        clean = AboutContent.sanitize_html("<p>Hello</p><script>alert(1)</script>")
        self.assertNotIn("<script", clean)
        self.assertIn("<p>Hello</p>", clean)

    def test_strips_inline_event_handlers(self):
        clean = AboutContent.sanitize_html('<p onclick="alert(1)">Hi</p>')
        self.assertNotIn("onclick", clean)
        self.assertIn("Hi", clean)

    def test_keeps_allowed_tags(self):
        dirty = "<p><strong>Bold</strong> and <em>italic</em></p><ul><li>Item</li></ul>"
        clean = AboutContent.sanitize_html(dirty)
        self.assertIn("<strong>Bold</strong>", clean)
        self.assertIn("<em>italic</em>", clean)
        self.assertIn("<li>Item</li>", clean)

    def test_strips_disallowed_iframe(self):
        clean = AboutContent.sanitize_html('<p>Hi</p><iframe src="https://evil"></iframe>')
        self.assertNotIn("<iframe", clean)

    def test_keeps_link_with_href(self):
        clean = AboutContent.sanitize_html('<a href="https://lspu.edu.ph">LSPU</a>')
        self.assertIn('href="https://lspu.edu.ph"', clean)

    def test_returns_empty_string_for_none(self):
        self.assertEqual(AboutContent.sanitize_html(None), "")

    def test_sanitize_subsections_passes_through_clean_data(self):
        result = AboutContent.sanitize_subsections([
            {"heading": "Mission", "body_html": "<p>Statement</p>"},
        ])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["heading"], "Mission")
        self.assertIn("<p>Statement</p>", result[0]["body_html"])

    def test_sanitize_subsections_strips_script_per_entry(self):
        result = AboutContent.sanitize_subsections([
            {"heading": "X", "body_html": "<p>ok</p><script>x</script>"},
        ])
        self.assertNotIn("<script", result[0]["body_html"])

    def test_sanitize_subsections_handles_none(self):
        self.assertEqual(AboutContent.sanitize_subsections(None), [])
