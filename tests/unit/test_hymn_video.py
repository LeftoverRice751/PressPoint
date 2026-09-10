"""The hymn pane plays a video, not just an audio file.

Three things are pinned here, because each fails silently in a different way:

1. THE UPLOAD GATE. `upload_hymn_audio` checks only the extension of the
   *browser-supplied filename*, which is attacker-controlled. nginx serves
   About/ directly and derives Content-Type from the extension, so that is the
   same shape of hole `tests/unit/test_upload_extension_binding.py` documents
   for avatars. The video endpoint gates twice instead: the extension against a
   narrow allowlist, and the bytes against libmagic.

2. THE NARROW EXTENSION SET. FileVerificationService's "video" set includes
   .mov and .ogg, which the kiosk browser frequently cannot decode. The failure
   mode is a silent black rectangle with no error anywhere -- the upload
   succeeded, the file is on the NAS, and the pane just shows nothing. So the
   hymn endpoint takes a narrower set than the shared one.

3. THE MARKUP CONTRACT. resources/js/about-lspu-kiosk.js drives the transport
   through data-* hooks. The audio and video elements are both addressed as
   `data-hymn-media` so one code path serves either; renaming one side alone
   leaves a player whose buttons do nothing, with no console error.
"""

import os
import tempfile
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import Mock, patch

from masonite.facades import View

from tests import TestCase

from app.controllers.kiosk import AboutController as about_module
from app.controllers.kiosk.AboutController import AboutController
from app.models.AboutSection import AboutSection
from app.services.AboutContent import AboutContent, DEFAULT_META, SECTION_SLUGS
from app.services.FileVerificationService import FileVerificationService

_REPO_ROOT = Path(__file__).resolve().parents[2]


def _mp4_bytes():
    """A real ISO base-media header, so libmagic reports video/mp4 for genuine
    reasons rather than us mocking the verification under test."""
    return b"\x00\x00\x00\x20ftypisom\x00\x00\x02\x00isomiso2avc1mp41" + b"\x00" * 64


def _webm_bytes():
    return (
        b"\x1aE\xdf\xa3\x01\x00\x00\x00\x00\x00\x00\x23B\x86\x81\x01B\xf7\x81\x01"
        b"B\xf2\x81\x04B\xf3\x81\x08B\x82\x84webmB\x87\x81\x02B\x85\x81\x02"
        + b"\x00" * 64
    )


def _mov_bytes():
    return b"\x00\x00\x00\x14ftypqt  \x00\x00\x02\x00qt  " + b"\x00" * 64


def _upload(filename, content):
    upload = Mock()
    upload.filename = filename
    upload.content = content
    upload.extension.return_value = os.path.splitext(filename)[1]
    return upload


def _mock_request(file):
    request = Mock()
    request.input.side_effect = lambda key, default="": (
        file if key == "file" else default
    )
    request.header.side_effect = lambda name: (
        "XMLHttpRequest" if name == "X-Requested-With" else None
    )
    return request


def _mock_response():
    response = Mock()
    redirect = Mock()
    redirect.with_success.return_value = "redirected"
    redirect.with_errors.return_value = "redirected-with-errors"
    response.redirect.return_value = redirect
    return response


class HymnVideoUploadTestCase(TestCase):
    def _upload_to_nas(self, filename, content, max_bytes=None):
        """Run the endpoint against a throwaway NAS root.

        Returns (result, the row the controller wrote to, files on disk).
        """
        section = Mock(spec=["video_path", "audio_path", "save"])
        section.video_path = None

        with tempfile.TemporaryDirectory() as tmp, ExitStack() as stack:
            stack.enter_context(
                patch.object(about_module, "gearsnas_base", return_value=tmp)
            )
            model = stack.enter_context(patch.object(about_module, "AboutSection"))
            if max_bytes is not None:
                stack.enter_context(
                    patch.object(about_module, "MAX_VIDEO_BYTES", max_bytes)
                )

            model.where.return_value.first.return_value = section
            result = AboutController().upload_hymn_video(
                _mock_request(_upload(filename, content)), _mock_response()
            )

            about_dir = os.path.join(tmp, "About")
            written = sorted(os.listdir(about_dir)) if os.path.isdir(about_dir) else []
            return result, section, written

    def test_mp4_is_stored_on_the_nas_and_recorded_on_the_row(self):
        result, section, written = self._upload_to_nas("hymn.mp4", _mp4_bytes())

        self.assertEqual(written, ["hymn_video.mp4"])
        self.assertEqual(section.video_path, "About/hymn_video.mp4")
        section.save.assert_called_once()
        self.assertNotEqual(result, "redirected-with-errors")

    def test_webm_is_accepted(self):
        _, section, written = self._upload_to_nas("hymn.webm", _webm_bytes())

        self.assertEqual(written, ["hymn_video.webm"])
        self.assertEqual(section.video_path, "About/hymn_video.webm")

    def test_quicktime_is_rejected_even_though_it_is_a_real_video(self):
        """.mov passes FileVerificationService's shared "video" set and libmagic
        both. The kiosk browser still cannot decode it, and a black rectangle
        reports nothing -- so the editor has to be told at upload time."""
        _, section, written = self._upload_to_nas("hymn.mov", _mov_bytes())

        self.assertEqual(written, [])
        self.assertIsNone(section.video_path)
        section.save.assert_not_called()

    def test_video_bytes_under_a_harmless_extension_are_rejected(self):
        """The extension gate runs first: valid MP4 bytes named .html must never
        reach the NAS, because nginx would serve it as text/html on this origin."""
        _, section, written = self._upload_to_nas("payload.html", _mp4_bytes())

        self.assertEqual(written, [])
        self.assertIsNone(section.video_path)

    def test_non_video_bytes_under_a_video_extension_are_rejected(self):
        """The magic gate is the second half: the filename says .mp4, the bytes
        say text/html. The extension allowlist alone would have stored this."""
        _, section, written = self._upload_to_nas(
            "hymn.mp4", b"<html><script>alert(1)</script></html>"
        )

        self.assertEqual(written, [])
        self.assertIsNone(section.video_path)

    def test_oversize_upload_is_rejected_before_it_is_written(self):
        """The handler buffers the whole file in memory and production runs five
        gunicorn processes, so the cap is a memory guard, not a disk one."""
        _, section, written = self._upload_to_nas(
            "hymn.mp4", _mp4_bytes() + b"\x00" * 4096, max_bytes=128
        )

        self.assertEqual(written, [])
        self.assertIsNone(section.video_path)

    def test_replacing_an_mp4_with_a_webm_leaves_no_orphan_behind(self):
        """The stored name carries the extension, so a re-upload in a different
        container writes a second file and the row points at only one of them.
        At up to 100 MB each, an orphan nobody can see from the dashboard is
        worth deleting."""
        section = Mock(spec=["video_path", "audio_path", "save"])
        section.video_path = None

        with tempfile.TemporaryDirectory() as tmp:
            nas_about = os.path.join(tmp, "About")
            os.makedirs(nas_about)
            with open(os.path.join(nas_about, "hymn_video.mp4"), "wb") as fh:
                fh.write(_mp4_bytes())

            with ExitStack() as stack:
                stack.enter_context(
                    patch.object(about_module, "gearsnas_base", return_value=tmp)
                )
                model = stack.enter_context(
                    patch.object(about_module, "AboutSection")
                )
                model.where.return_value.first.return_value = section
                AboutController().upload_hymn_video(
                    _mock_request(_upload("hymn.webm", _webm_bytes())),
                    _mock_response(),
                )

            self.assertEqual(sorted(os.listdir(nas_about)), ["hymn_video.webm"])
            self.assertEqual(section.video_path, "About/hymn_video.webm")

    def test_cleanup_never_touches_the_audio_file(self):
        """hymn_audio.mp3 lives in the same folder and is the fallback the
        kiosk needs when no video is uploaded."""
        section = Mock(spec=["video_path", "audio_path", "save"])
        section.video_path = None

        with tempfile.TemporaryDirectory() as tmp:
            nas_about = os.path.join(tmp, "About")
            os.makedirs(nas_about)
            for name in ("hymn_audio.mp3", "seal.png"):
                with open(os.path.join(nas_about, name), "wb") as fh:
                    fh.write(b"x")

            with ExitStack() as stack:
                stack.enter_context(
                    patch.object(about_module, "gearsnas_base", return_value=tmp)
                )
                model = stack.enter_context(
                    patch.object(about_module, "AboutSection")
                )
                model.where.return_value.first.return_value = section
                AboutController().upload_hymn_video(
                    _mock_request(_upload("hymn.mp4", _mp4_bytes())),
                    _mock_response(),
                )

            self.assertEqual(
                sorted(os.listdir(nas_about)),
                ["hymn_audio.mp3", "hymn_video.mp4", "seal.png"],
            )

    def test_the_cap_is_a_hundred_megabytes(self):
        self.assertEqual(about_module.MAX_VIDEO_BYTES, 100 * 1024 * 1024)

    def test_only_browser_decodable_extensions_are_offered(self):
        self.assertEqual(
            set(about_module.HYMN_VIDEO_EXTENSIONS), {".mp4", ".webm", ".m4v"}
        )


class VideoMagicTypesTestCase(TestCase):
    """FileVerificationService had extensions for "video" but no MIME list, so
    verify_buffer(content, "video") checked against an empty allowlist and
    rejected everything. Any caller that gates video by bytes needs this."""

    def test_video_has_a_mime_allowlist(self):
        self.assertIn("video", FileVerificationService.ALLOWED_TYPES)

    def test_real_video_bytes_verify(self):
        self.assertTrue(FileVerificationService.verify_buffer(_mp4_bytes(), "video"))
        self.assertTrue(FileVerificationService.verify_buffer(_webm_bytes(), "video"))

    def test_markup_does_not_verify_as_video(self):
        self.assertFalse(
            FileVerificationService.verify_buffer(b"<html></html>", "video")
        )


class VideoPathIsPersistableTestCase(TestCase):
    """The controller assigns section.video_path and calls save(). Masonite's
    Model.__setattr__ routes unknown columns into __dirty_attributes__ and
    save() filters them through __fillable__, so a column missing from the model
    is dropped with no error -- the same silent loss EventController hit."""

    def test_video_path_survives_mass_assignment_filtering(self):
        kept = AboutSection.filter_fillable({"video_path": "About/hymn_video.mp4"})

        self.assertIn("video_path", kept)


class _Section:
    """Enough of an AboutSection row for the kiosk template."""

    def __init__(self, slug, **overrides):
        self.slug = slug
        self.title = overrides.get("title", slug.title())
        self.body_html = overrides.get("body_html", "<p>Body.</p>")
        self.subsections = overrides.get("subsections")
        self.image_path = overrides.get("image_path")
        self.audio_path = overrides.get("audio_path")
        self.video_path = overrides.get("video_path")
        self.lyric_timings = overrides.get("lyric_timings")
        self.meta = overrides.get("meta")


class HymnKioskMarkupTestCase(TestCase):
    def _render(self, **hymn_overrides):
        meta = {slug: AboutContent.meta_for(slug) for slug in DEFAULT_META}
        sections = {slug: _Section(slug) for slug in SECTION_SLUGS}
        sections["hymn"] = _Section("hymn", **hymn_overrides)

        return View.render(
            "kiosk/about-lspu",
            {
                "sections": sections,
                "ordered_slugs": SECTION_SLUGS,
                "milestones": [],
                "active_nav": "about",
                "group_values": [],
                "core_acrostic": [{"letter": "S", "rest": "pirited"}],
                "pledge_lines": [],
                "core_html": "",
                "pledge_html": "",
                "quality_statement": "A statement.",
                "quality_support": "",
                "hymn_lines": ["Line one", "Line two"],
                "tile_meta": meta,
                "page": meta["page"],
                "seal_hotspots": meta["seal"].get("hotspots") or [],
            },
        ).rendered_template

    def _hymn_block(self, html):
        start = html.index("<section class=\"hymn\"")
        return html[start: html.index("</section>", start)]

    def test_video_is_rendered_when_one_is_uploaded(self):
        block = self._hymn_block(self._render(video_path="About/hymn_video.mp4"))

        self.assertIn("<video", block)
        self.assertIn("/storage/About/hymn_video.mp4", block)

    def test_the_video_element_answers_to_the_shared_media_hook(self):
        """One JS path drives audio and video; the selector is the contract."""
        block = self._hymn_block(self._render(video_path="About/hymn_video.mp4"))

        self.assertIn("data-hymn-media", block)

    def test_the_first_frame_is_painted_rather_than_a_black_box(self):
        """preload="metadata" alone leaves an empty rectangle until first play.
        The #t= media fragment makes the browser seek and paint frame one, which
        is a poster image with no extra upload for the editor to manage."""
        block = self._hymn_block(self._render(video_path="About/hymn_video.mp4"))

        self.assertRegex(block, r"/storage/About/hymn_video\.mp4#t=")

    def test_native_controls_are_off_so_there_is_only_one_transport(self):
        """Browser chrome on the video plus the custom bar below the lyrics is
        two sets of controls for one stream, and the native one cannot be
        styled to match the kiosk."""
        block = self._hymn_block(self._render(video_path="About/hymn_video.mp4"))
        video_tag = block[block.index("<video"): block.index(">", block.index("<video"))]

        self.assertNotIn("controls", video_tag)

    def test_audio_still_plays_when_no_video_has_been_uploaded_yet(self):
        """Existing installs have an audio file and no video. Dropping the audio
        branch would empty the pane on every one of them."""
        block = self._hymn_block(self._render(audio_path="About/hymn_audio.mp3"))

        self.assertIn("<audio", block)
        self.assertIn("data-hymn-media", block)
        self.assertNotIn("<video", block)

    def test_video_wins_when_both_exist(self):
        block = self._hymn_block(
            self._render(
                video_path="About/hymn_video.mp4", audio_path="About/hymn_audio.mp3"
            )
        )

        self.assertIn("<video", block)
        self.assertNotIn("<audio", block)

    def test_the_transport_bar_sits_below_the_lyrics(self):
        """The requested reading order: watch, read, then reach for the
        controls. Both elements are in one flex column, so DOM order is the
        whole layout."""
        block = self._hymn_block(self._render(video_path="About/hymn_video.mp4"))

        self.assertLess(block.index("hymn__lyrics"), block.index("hymn__player"))

    def test_the_stage_is_above_the_lyrics(self):
        block = self._hymn_block(self._render(video_path="About/hymn_video.mp4"))

        self.assertLess(block.index("hymn__stage"), block.index("hymn__lyrics"))

    def test_the_bar_offers_a_restart(self):
        block = self._hymn_block(self._render(video_path="About/hymn_video.mp4"))

        self.assertIn("data-hymn-restart", block)

    def test_the_stage_itself_is_a_play_toggle(self):
        block = self._hymn_block(self._render(video_path="About/hymn_video.mp4"))

        self.assertIn("data-hymn-stage", block)

    def test_a_hymn_with_no_media_still_shows_its_lyrics(self):
        block = self._hymn_block(self._render())

        self.assertIn("Line one", block)
        self.assertNotIn("hymn__player", block)


class HymnEditorPanelTestCase(TestCase):
    def _render(self):
        meta = {slug: AboutContent.meta_for(slug) for slug in DEFAULT_META}
        return View.render(
            "gears/partials/panel-about-lspu",
            {
                "sections": {slug: _Section(slug) for slug in SECTION_SLUGS},
                "ordered_slugs": SECTION_SLUGS,
                "milestones": [],
                "about_meta": meta,
                "about_page": meta["page"],
                "bag": type("B", (), {"any": lambda s: False,
                                      "messages": lambda s, *a, **k: []}),
                "csrf_field": "",
            },
        ).rendered_template

    def test_the_panel_can_upload_a_hymn_video(self):
        html = self._render()

        self.assertIn('action="/gears/about-lspu/hymn/video"', html)

    def _video_form(self, html):
        start = html.rindex(
            "<form", 0, html.index('action="/gears/about-lspu/hymn/video"')
        )
        return html[start: html.index("</form>", start)]

    def test_the_video_form_posts_multipart(self):
        """Without it the plain form post degrades to url-encoded and drops the
        file with no error -- the same trap events-modal.html documents."""
        form = self._video_form(self._render())

        self.assertIn('enctype="multipart/form-data"', form)
        self.assertIn("video/mp4", form)
        self.assertIn("video/webm", form)

    def test_the_video_form_reports_upload_progress_like_its_siblings(self):
        """data-upload-form is what wires the dashboard's upload meter. A
        100 MB file with no meter reads as a frozen page."""
        form = self._video_form(self._render())

        self.assertIn("data-upload-form", form)


class HymnRouteTestCase(TestCase):
    def test_the_upload_route_is_registered_behind_auth(self):
        routes = (_REPO_ROOT / "routes" / "dashboard.py").read_text()
        line = [
            ln for ln in routes.splitlines()
            if "/gears/about-lspu/hymn/video" in ln
        ]

        self.assertTrue(line, "the hymn video upload route is not registered")
        self.assertIn('middleware("auth")', line[0])


class HymnTransportScriptTestCase(TestCase):
    """The kiosk JS is a source contract with the template above."""

    def _source(self):
        return (
            _REPO_ROOT / "resources" / "js" / "about-lspu-kiosk.js"
        ).read_text()

    def test_the_transport_addresses_the_shared_media_hook(self):
        self.assertIn("data-hymn-media", self._source())

    def test_leaving_the_pane_stops_a_playing_video(self):
        """The pane-leave guard already existed for audio: navigating away with
        the hymn playing left it audible under the next pane. A video-only
        selector rename here would resurrect exactly that bug."""
        source = self._source()
        leave = source[: source.index("Hymn: transport")]

        self.assertIn("data-hymn-media", leave)

    def test_the_restart_control_is_wired(self):
        self.assertIn("data-hymn-restart", self._source())

    def test_the_stage_is_wired_as_a_toggle(self):
        self.assertIn("data-hymn-stage", self._source())

    def test_the_transport_no_longer_bails_out_on_a_missing_audio_element(self):
        """`querySelector('[data-hymn-audio]')` followed by `if (!audio) return`
        is what would silently disable every control on a video-only hymn."""
        self.assertNotIn("data-hymn-audio", self._source())


class HymnStyleTestCase(TestCase):
    def _source(self):
        return (
            _REPO_ROOT / "resources" / "css" / "about-lspu-kiosk.css"
        ).read_text()

    def test_the_stage_is_styled(self):
        self.assertIn(".hymn__stage", self._source())

    def test_the_stage_leaves_vertical_room_for_the_lyrics(self):
        """768x1024 portrait: an unconstrained 16:9 video plus lyrics plus the
        bar overflows the pane and the bar becomes unreachable."""
        source = self._source()
        stage = source[source.index(".hymn__stage"):]
        stage = stage[: stage.index("}")]

        self.assertIn("max-height", stage)

    def test_the_stage_letterboxes_rather_than_crops(self):
        source = self._source()
        block = source[source.index(".hymn__stage"): source.index(".hymn__lyrics")]

        self.assertIn("object-fit: contain", block)

    def test_the_pane_uses_flat_colour(self):
        """House rule: solid/flat colours, no gradients."""
        source = self._source()
        hymn = source[source.index(".hymn"):]

        self.assertNotIn("gradient", hymn)
