"""Event images: a new NAS folder, and the two places it has to be declared.

`events.event_image` stores a NAS-relative path ("Events/event-<hex>.png") and
the file itself lives on the GearsNAS share. That only works if "Events" is
declared in *both* StorageRouter.NAS_FOLDERS and the regex `location` block in
deploy/nginx-presspoint.conf. Declaring it in one alone is silent: the app keeps
working in dev (Python serves everything) and in production every event image
falls through to VideoController.serve_storage, which reads ranges into memory.

The template assertions guard the two things that broke visually: the events
table's handoff of the poster to its view modal (the table itself shows no
image, so `data-event-image` on the row is the modal's only source, and the
empty-state colspan has to match the column count) and the view-modal close
control, which painted the glyph from CSS ::before *and* the literal word
"Close" next to it inside a 2rem circle.
"""

import os
import re
import struct
import tempfile
import zlib
from pathlib import Path
from unittest.mock import Mock, patch

from masonite.facades import View

from tests import TestCase

from app.controllers.gears.EventController import EventController
from app.models.Events import Events
from app.services import ImageUploads
from app.services.StorageRouter import NAS_FOLDERS, absolute_path

_REPO_ROOT = Path(__file__).resolve().parents[2]


def _png_chunk(kind, payload):
    body = kind + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))


def _real_png_bytes():
    raw = zlib.compress(b"\x00\x00\x00\x00")
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 0, 0, 0, 0))
        + _png_chunk(b"IDAT", raw)
        + _png_chunk(b"IEND", b"")
    )


def _upload(filename, content):
    upload = Mock()
    upload.filename = filename
    upload.content = content
    upload.extension.return_value = os.path.splitext(filename)[1]
    return upload


class _Event:
    def __init__(self, id=1, title="Foundation Day", description="A day.",
                 event_date=None, location_id=None, event_image=None, is_archive=False):
        self.id = id
        self.title = title
        self.description = description
        self.event_date = event_date
        self.location_id = location_id
        self.event_image = event_image
        self.is_archive = is_archive


class EventsNasFolderTestCase(TestCase):
    def test_events_is_a_declared_nas_folder(self):
        self.assertIn("Events", NAS_FOLDERS)

    def test_event_image_path_resolves_onto_the_nas_mount(self):
        with patch("app.services.StorageRouter.gearsnas_base", return_value="/mnt/nas"):
            self.assertEqual(
                absolute_path("Events/event-abc123.png"),
                "/mnt/nas/Events/event-abc123.png",
            )

    def test_nginx_regex_lists_every_nas_folder(self):
        """The sync that has no runtime signal when it is wrong."""
        conf = (_REPO_ROOT / "deploy" / "nginx-presspoint.conf").read_text()
        match = re.search(r"location ~ \^/storage/\(\(\?:([^)]+)\)/\.\*\)\$", conf)
        self.assertIsNotNone(match, "could not find the NAS regex location block")

        listed = tuple(match.group(1).split("|"))
        self.assertEqual(
            sorted(listed),
            sorted(NAS_FOLDERS),
            "deploy/nginx-presspoint.conf and StorageRouter.NAS_FOLDERS disagree",
        )


class EventImageUploadTestCase(TestCase):
    def _save(self, filename, content):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(ImageUploads, "gearsnas_base", return_value=tmp):
                stored, error = ImageUploads.save_uploaded_image(
                    _upload(filename, content), "Events", "event"
                )
                on_disk = os.path.exists(os.path.join(tmp, stored)) if stored else False
            return stored, error, on_disk

    def test_png_is_stored_under_events(self):
        stored, error, on_disk = self._save("poster.png", _real_png_bytes())

        self.assertIsNone(error)
        self.assertTrue(stored.startswith("Events/"), stored)
        self.assertTrue(stored.lower().endswith(".png"), stored)
        self.assertTrue(on_disk, "the verified image was never written to the NAS")

    def test_non_image_upload_is_rejected(self):
        stored, error, _ = self._save("poster.png", b"not an image at all")

        self.assertIsNone(stored)
        self.assertIsNotNone(error)

    def test_extension_follows_verified_content_not_the_filename(self):
        stored, error, _ = self._save("poster.html", _real_png_bytes())

        self.assertIsNone(error)
        self.assertFalse(stored.lower().endswith(".html"), stored)


class EventsTableTemplateTestCase(TestCase):
    def _render(self, events):
        return View.render(
            "gears/partials/events-list",
            {"events": events, "location_lookup": {}},
        ).rendered_template

    def test_row_carries_the_image_path_for_the_view_modal(self):
        """The table paints no poster; it hands the path to the row's dialog."""
        html = self._render([_Event(event_image="Events/event-abc.png")])

        self.assertIn('data-event-image="/storage/Events/event-abc.png"', html)
        self.assertNotIn("<img", html)

    def test_event_without_an_image_hands_the_modal_an_empty_path(self):
        """Empty rather than absent: openEventViewModal() reads the attribute
        and hides its <img> on a falsy value, so a missing poster never costs
        a request that nginx 404s and then replays through the fallback."""
        html = self._render([_Event(event_image=None)])

        self.assertIn('data-event-image=""', html)
        self.assertNotIn("<img", html)

    def test_empty_state_colspan_matches_the_column_count(self):
        html = self._render([])

        header_count = html.count("<th ")
        self.assertEqual(header_count, 5)
        self.assertIn('colspan="5"', html)


class EventModalCloseTestCase(TestCase):
    """The reported bug: the close control read as the word "Close" in a circle."""

    def _view_modal(self):
        return (
            _REPO_ROOT / "templates" / "gears" / "partials" / "events-view-modal.html"
        ).read_text()

    def _add_modal(self):
        return (
            _REPO_ROOT / "templates" / "gears" / "partials" / "events-modal.html"
        ).read_text()

    def test_view_modal_close_has_no_visible_label(self):
        """Every occurrence of the word must sit inside the hidden span, not
        loose in the button where it paints beside the ::before glyph."""
        markup = self._view_modal()
        for match in re.finditer(r"Close<", markup):
            preceding = markup[:match.start()]
            self.assertTrue(
                preceding.rstrip().endswith('<span class="u-visually-hidden">'),
                "the close button still renders a visible text label",
            )
        self.assertIn('aria-label="Close"', markup)

    def test_view_modal_close_keeps_an_accessible_name(self):
        self.assertIn("u-visually-hidden", self._view_modal())

    def test_add_modal_close_controls_are_labelled_not_captioned(self):
        markup = self._add_modal()
        self.assertIn('aria-label="Close"', markup)

    def test_view_modal_poster_sits_below_the_description(self):
        """It used to be a full-bleed banner above the title. The dialog is now
        the only place the poster appears, and it reads as detail after the
        summary rather than as a hero image before it."""
        markup = self._view_modal()

        description = markup.index("data-event-view-description")
        image = markup.index("data-event-view-image")
        self.assertGreater(image, description)

    def test_view_modal_poster_starts_hidden(self):
        """openEventViewModal() reveals it only when the row carries a path;
        without the attribute an event with no poster shows an empty frame."""
        self.assertRegex(self._view_modal(), r"data-event-view-image[^>]*hidden")


class EventImageFieldTestCase(TestCase):
    def _markup(self):
        return (
            _REPO_ROOT / "templates" / "gears" / "partials" / "events-modal.html"
        ).read_text()

    def test_form_posts_multipart_for_the_no_js_fallback(self):
        """The AJAX path sends FormData regardless, but the plain form post
        degrades to url-encoded and silently drops the file without this."""
        self.assertIn('enctype="multipart/form-data"', self._markup())

    def test_file_input_is_named_event_image_and_restricted_to_images(self):
        markup = self._markup()
        self.assertIn('name="event_image"', markup)
        self.assertIn('type="file"', markup)
        self.assertIn("image/jpeg", markup)
        self.assertIn("image/png", markup)
        self.assertIn("image/webp", markup)

    def test_field_is_optional(self):
        """Archive-sourced events carry no image, so requiring one here would
        make the modal inconsistent with rows that already exist."""
        markup = self._markup()
        field = markup[markup.index('name="event_image"') - 400:]
        field = field[: field.index(">", field.index('name="event_image"')) + 1]
        self.assertNotIn("required", field)


def _mock_request(inputs):
    request = Mock()
    request.input.side_effect = lambda key, default="": inputs.get(key, default)
    request.header.side_effect = lambda name: (
        "XMLHttpRequest" if name == "X-Requested-With" else None
    )
    return request


def _mock_response():
    response = Mock()
    redirect_response = Mock()
    redirect_response.with_success.return_value = "redirected"
    redirect_response.with_errors.return_value = "redirected-with-errors"
    response.redirect.return_value = redirect_response
    response.back.return_value = redirect_response
    return response


def _empty_file_part():
    """What a browser sends for a file input the editor never touched: a real
    multipart part carrying an empty filename and zero bytes. Masonite wraps it
    as an UploadedFile all the same, so it is truthy -- which is exactly why a
    bare `if upload:` guard is wrong for an optional field."""
    upload = Mock()
    upload.filename = ""
    upload.content = b""
    upload.extension.return_value = ""
    return upload


class EventControllerImageTestCase(TestCase):
    """store()'s upload branch. Reject-on-error: a bad image fails the whole
    submit rather than silently saving an event the editor believes has a
    poster attached."""

    def _store(self, inputs, save_result=None):
        request = _mock_request(inputs)
        response = _mock_response()

        with patch("app.controllers.gears.EventController.Events") as events, patch(
            "app.controllers.gears.EventController.NewEvent"
        ), patch(
            "app.controllers.gears.EventController.save_uploaded_image"
        ) as saver:
            events.create.return_value = Mock(id=7)
            if save_result is not None:
                saver.return_value = save_result
            result = EventController().store(request, response)
            return result, events.create, saver

    def _valid_inputs(self, **extra):
        inputs = {
            "title": "Foundation Day",
            "description": "A campus-wide celebration.",
            "event_date": "2026-09-30T09:00",
            "location_id": "",
        }
        inputs.update(extra)
        return inputs

    def test_event_saves_with_no_image_when_none_was_attached(self):
        _, create, saver = self._store(self._valid_inputs())

        create.assert_called_once()
        self.assertIsNone(create.call_args.kwargs["event_image"])
        saver.assert_not_called()

    def test_untouched_file_input_is_not_treated_as_an_upload(self):
        """The regression this guard exists for: an empty part must not reach
        the saver, where magic-byte verification would reject it and fail an
        otherwise valid submit."""
        _, create, saver = self._store(
            self._valid_inputs(event_image=_empty_file_part())
        )

        saver.assert_not_called()
        create.assert_called_once()
        self.assertIsNone(create.call_args.kwargs["event_image"])

    def test_verified_image_path_is_persisted(self):
        upload = _upload("poster.png", _real_png_bytes())
        _, create, saver = self._store(
            self._valid_inputs(event_image=upload),
            save_result=("Events/event-abc123.png", None),
        )

        saver.assert_called_once_with(upload, "Events", "event")
        self.assertEqual(
            create.call_args.kwargs["event_image"], "Events/event-abc123.png"
        )

    def test_masonite_list_wrapped_upload_is_unwrapped(self):
        """InputBag wraps a multipart file as {name: [UploadedFile]}, so the
        guard has to look inside the list to find the filename."""
        upload = _upload("poster.png", _real_png_bytes())
        _, create, saver = self._store(
            self._valid_inputs(event_image=[upload]),
            save_result=("Events/event-def456.png", None),
        )

        saver.assert_called_once()
        self.assertEqual(
            create.call_args.kwargs["event_image"], "Events/event-def456.png"
        )

    def test_rejected_image_fails_the_whole_submit(self):
        result, create, _ = self._store(
            self._valid_inputs(event_image=_upload("poster.png", b"not an image")),
            save_result=(None, "Upload must be a JPEG, PNG, or WEBP image."),
        )

        create.assert_not_called()
        self.assertIsNotNone(result)

    def test_upload_is_not_attempted_when_the_rest_of_the_form_is_invalid(self):
        """Ordering guard: a submit that is going to fail validation must not
        leave an orphaned file on the NAS."""
        _, create, saver = self._store(
            self._valid_inputs(title="", event_image=_upload("p.png", _real_png_bytes()))
        )

        saver.assert_not_called()
        create.assert_not_called()


class EventCreatePayloadIsFillableTestCase(TestCase):
    """The store() tests above patch Events.create, so they prove the controller
    *passes* the image path -- never that the ORM *keeps* it. It did not.

    `event_image` was missing from Events.__fillable__, and Masonite's
    QueryBuilder.create runs the payload through Model.filter_fillable, which
    rebuilds it as {x: d[x] for x in __fillable__ if x in d}: an unlisted key is
    dropped with no error and no warning. Every poster an editor attached was
    written to the NAS and then orphaned, the row stored event_image = NULL, and
    the dashboard's view modal correctly hid an <img> it had no path for.

    So assert the whole create() payload survives the filter, not just the one
    column that broke -- the next column added to the controller and forgotten
    in the model fails exactly the same way, silently.
    """

    # Every keyword EventController.store passes to Events.create.
    CREATE_KEYS = {
        "title",
        "description",
        "event_date",
        "location_id",
        "event_image",
        "is_archive",
    }

    def test_every_create_keyword_survives_mass_assignment_filtering(self):
        payload = {key: "value" for key in self.CREATE_KEYS}

        kept = Events.filter_fillable(payload)

        self.assertEqual(
            set(kept),
            self.CREATE_KEYS,
            "Events.__fillable__ is missing columns EventController.store writes; "
            "the ORM drops them silently.",
        )
