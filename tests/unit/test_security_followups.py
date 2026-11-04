"""Smaller findings from the editor and admin security re-scan."""

import os
import pathlib
import re
import tempfile
from importlib import import_module
from unittest import TestCase
from unittest.mock import Mock, patch

from app.controllers.auth.LoginController import LoginController
from app.controllers.gears.DashboardController import DashboardController
from app.controllers.gears.OrgBoardController import OrgBoardController
from app.controllers.gears.VideoController import VideoController
from app.exceptions.Handler import Handler
from app.models.News import News
from app.models.NewsCategory import NewsCategory
from app.models.User import User
from app.services import NewsCategories, SessionTokens
from app.services.FileVerificationService import FileVerificationService
from masoniteorm.query.QueryBuilder import QueryBuilder
from wsgi import application

ROOT = pathlib.Path(__file__).resolve().parents[2]

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"\x00" * 64
GIF = b"GIF89a" + b"\x01\x00\x01\x00\x80\x00\x00" + b"\x00" * 32
HTML = b"<!doctype html><html><script>alert(1)</script></html>"
MP4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 64
MP3 = b"\xff\xfb\x90\x64" + b"\x00" * 400
# libmagic reports this valid shape as application/octet-stream.
TAGGED_MP3 = (
    b"ID3\x04\x00\x00\x00\x00\x1f\x20TIT2\x00\x00\x00\x05\x00\x00\x03Hym"
    + b"\x00" * 3985
    + b"\xff\xfb\x90\x64"
    + b"\x00" * 400
)
WAV = b"RIFF\x24\x00\x00\x00WAVEfmt " + b"\x00" * 64
OGG = b"OggS\x00\x02" + b"\x00" * 20 + b"\x01\x1e\x01vorbis" + b"\x00" * 64


def _upload(content, extension):
    upload = Mock()
    upload.name = f"file{extension}"
    upload.filename = f"file{extension}"
    upload.content = content
    upload.extension.return_value = extension
    upload.get_content.return_value = content
    return upload


def _request(inputs=None, role="editor"):
    inputs = inputs or {}
    request = Mock()
    request.input.side_effect = lambda key, default="": inputs.get(key, default)
    request.header.side_effect = lambda name: (
        "XMLHttpRequest" if name == "X-Requested-With" else None
    )
    request.user.return_value = Mock(id=5, role=role)
    return request


class AddOrgBoardMemberTestCase(TestCase):
    def _add(self, photo=None):
        module = "app.controllers.gears.OrgBoardController"
        storage = Mock()
        with patch(f"{module}.Organization") as organization, patch(
            f"{module}.Member"
        ) as member, patch(f"{module}.member_node", return_value={}), patch.object(
            OrgBoardController, "_all_members", return_value=[]
        ), patch.object(
            OrgBoardController, "_organization_payload", return_value={}
        ):
            organization.find.return_value = Mock(id=1)
            OrgBoardController().store(
                _request(
                    {
                        "name": "Ann",
                        "position": "Dean",
                        "organization_id": "1",
                        "photo_path": photo,
                    }
                ),
                storage,
                Mock(),
            )
        return member, storage

    def test_adding_a_member_creates_the_row(self):
        member, _ = self._add()
        member.create.assert_called_once()

    def test_a_real_photo_is_stored(self):
        _, storage = self._add(_upload(PNG, ".png"))
        storage.disk.return_value.put_file.assert_called_once()

    def test_a_page_named_as_a_photo_is_not_stored(self):
        member, storage = self._add(_upload(HTML, ".png"))
        storage.disk.return_value.put_file.assert_not_called()
        member.create.assert_not_called()


class UploadContentTestCase(TestCase):
    def test_a_gif_counts_as_a_photo(self):
        self.assertTrue(FileVerificationService.verify_buffer(GIF, "photo"))

    def test_html_is_not_a_photo(self):
        self.assertFalse(FileVerificationService.verify_buffer(HTML, "photo"))

    def test_common_audio_formats_are_recognised(self):
        for content in (MP3, TAGGED_MP3, WAV, OGG):
            self.assertTrue(FileVerificationService.verify_audio(content))

    def test_html_is_not_audio(self):
        self.assertFalse(FileVerificationService.verify_audio(HTML))

    def test_unidentified_bytes_are_not_audio(self):
        self.assertFalse(FileVerificationService.verify_audio(b"\x00\x01\x02" * 100))

    def _upload_video(self, content):
        module = "app.controllers.gears.VideoController"
        storage = Mock()
        with patch(f"{module}.Video"), patch(f"{module}._broadcast_play_video"):
            VideoController().upload(
                _request({"title": "Clip", "video": _upload(content, ".mp4")}),
                storage,
                Mock(),
            )
        return storage

    def test_a_real_video_is_stored(self):
        storage = self._upload_video(MP4)
        storage.disk.return_value.put_file.assert_called_once()

    def test_a_page_named_as_a_video_is_not_stored(self):
        storage = self._upload_video(HTML)
        storage.disk.return_value.put_file.assert_not_called()


class BlankRoleLoginTestCase(TestCase):
    def test_an_account_with_no_role_leaves_with_no_session(self):
        user = User()
        user.set_remember_token()
        before = user.remember_token
        user.role = ""
        request, response = _request({"username": "ann", "password": "x"}), Mock()
        request.tab_slot = 0
        request.cookie_jar.to_dict.return_value = {}
        module = "app.controllers.auth.LoginController"
        with patch(f"{module}.User") as user_model, patch(f"{module}.AuditLog"), patch(
            f"{module}.allocate_slot", return_value=0
        ), patch.object(User, "save"):
            user_model.return_value.attempt.return_value = user
            user_model.where.return_value.first.return_value = user
            LoginController().store(request, response)

        self.assertNotEqual(user.remember_token, before)
        response.delete_cookie.assert_called_with("token")
        request.remove_user.assert_called()


class ProductionErrorTextTestCase(TestCase):
    def _handled(self, exception, debug=False):
        app = Mock()
        app.is_debug.return_value = debug
        app.has.return_value = False
        with patch("app.exceptions.Handler._logger"):
            Handler(app).handle(exception)
        return exception

    def test_an_unexpected_error_does_not_reach_the_client(self):
        exception = self._handled(RuntimeError("(1045) Access denied for user 'presspoint'"))
        self.assertEqual(exception.get_status(), 500)
        self.assertNotIn("presspoint", exception.get_response())

    def test_an_http_error_keeps_its_own_message(self):
        error = RuntimeError("raw")
        error.is_http_exception = True
        error.get_status = lambda: 403
        error.get_response = lambda: "Not allowed"

        self._handled(error)

        self.assertEqual(error.get_response(), "Not allowed")


class EveryRouteHasAHandlerTestCase(TestCase):
    def test_every_route_names_a_method_that_exists(self):
        pattern = re.compile(r'"((?:gears|kiosk|auth)\.\w+)@(\w+)"')
        for path in (ROOT / "routes").glob("*.py"):
            for target, method in pattern.findall(path.read_text()):
                module = import_module(f"app.controllers.{target}")
                controller = getattr(module, target.split(".")[-1])
                self.assertTrue(hasattr(controller, method), f"{path.name}: {target}@{method}")


class CategoryRestoreTestCase(TestCase):
    """The ORM's mass-assignment filter silently dropped deleted_at, so the
    restore ran no SQL at all while reporting success."""

    def _restore(self, story_status):
        executed = []

        def connection():
            conn = Mock()
            conn.query.side_effect = (
                lambda sql, bindings=(), results="*": executed.append((sql, list(bindings))) or {}
            )
            return conn

        story = Mock(id=9, status=story_status)
        with patch.object(
            QueryBuilder, "new_connection", side_effect=lambda: connection()
        ), patch.object(NewsCategories, "story_count", return_value=1), patch.object(
            NewsCategories, "_trashed_stories", return_value=[story]
        ), patch.object(
            NewsCategory, "only_trashed"
        ) as only_trashed, patch.object(
            NewsCategory, "where"
        ) as live, patch.object(
            NewsCategories.NewsCache, "forget"
        ), patch.object(
            NewsCategories.KioskBroadcast, "section_changed"
        ):
            only_trashed.return_value.where.return_value.first.return_value = Mock(id=3)
            live.return_value.first.return_value = Mock(id=3, name="Sports")
            outcome, _ = NewsCategories.restore_cascade(3)
        self.assertEqual(outcome, "restored")
        return executed

    def _updates_to(self, executed, table):
        return [
            (sql, bindings)
            for sql, bindings in executed
            if sql.upper().startswith("UPDATE") and table in sql
        ]

    def test_the_category_and_its_stories_are_undeleted(self):
        executed = self._restore("draft")
        for table in ("news_categories", "news"):
            updates = self._updates_to(executed, f"`{table}`")
            self.assertTrue(any("deleted_at" in sql for sql, _ in updates), table)

    def test_a_published_story_comes_back_for_review(self):
        executed = self._restore("published")
        updates = self._updates_to(executed, "`news`")
        self.assertTrue(
            any("status" in sql and "review" in bindings for sql, bindings in updates), updates
        )

    def test_a_draft_stays_a_draft(self):
        executed = self._restore("draft")
        updates = self._updates_to(executed, "`news`")
        self.assertFalse(any("review" in bindings for _, bindings in updates), updates)

    def test_the_trashed_story_query_includes_deleted_rows(self):
        sql = News.with_trashed().where("category_id", 3).to_sql()
        self.assertNotIn("deleted_at", sql)


class AdminOnlySurfacesTestCase(TestCase):
    def test_branding_routes_are_admin_only(self):
        routes = {
            route.get_name(): route
            for route in application.make("router").routes
            if route.get_name()
        }
        for name in ("branding.logo.upload", "branding.logo.restore"):
            self.assertIn("admin", routes[name].list_middleware, name)

    def test_branding_lands_back_on_the_admin_console(self):
        from app.controllers.gears.BrandingController import BrandingController

        request = _request(role="admin")
        request.header.side_effect = lambda name: None
        response = Mock()
        with patch("app.controllers.gears.BrandingController.Branding"):
            BrandingController().restore(request, response)

        self.assertEqual(response.redirect.call_args.kwargs["name"], "users.view")

    def test_branding_is_on_the_admin_console_and_not_the_editor_dashboard(self):
        console = (ROOT / "templates/gears/admin-console.html").read_text()
        dashboard = (ROOT / "templates/gears/dashboard.html").read_text()
        self.assertIn("panel-branding.html", console)
        self.assertIn('data-page-link="branding"', console)
        self.assertNotIn("panel-branding.html", dashboard)
        self.assertNotIn('data-page-link="branding"', dashboard)

    def _fragment(self, section, role):
        response = Mock()
        view = Mock()
        view.render.return_value.rendered_template = "<div></div>"
        DashboardController().fragment(section, view, _request(role=role), response)
        return response, view

    def test_an_editor_cannot_read_the_admin_fragments(self):
        for section in ("review", "admin-stats"):
            response, view = self._fragment(section, "editor")
            view.render.assert_not_called()
            self.assertEqual(response.json.call_args.kwargs["status"], 403)

    def test_an_admin_can_read_the_admin_fragments(self):
        with patch.dict(
            "app.controllers.gears.DashboardController.FRAGMENTS",
            {"review": (lambda: {}, "t", "rows"), "admin-stats": (lambda: {}, "t", "rows")},
        ), patch.object(DashboardController, "_stamp_for", return_value="1:x"):
            for section in ("review", "admin-stats"):
                _, view = self._fragment(section, "admin")
                view.render.assert_called_once()


class SessionTokenSanityTestCase(TestCase):
    def test_a_fresh_login_token_survives_its_own_check(self):
        """Guards the login path against the lifetime check refusing its own token."""
        with patch.object(SessionTokens, "_key", lambda: b"k"), patch.object(
            SessionTokens.User, "where"
        ) as where:
            where.return_value.first.return_value = "user"
            self.assertEqual(SessionTokens.find_user(SessionTokens.new_token()), "user")


class NewsAndHymnUploadsTestCase(TestCase):
    def _store_news(self, upload):
        module = "app.controllers.gears.NewsController"
        from app.controllers.gears.NewsController import NewsController

        storage = Mock()
        request = _request(
            {
                "title": "Story",
                "description": "<p>Body</p>",
                "category_id": "2",
                "layout_type": "brief",
                "image": upload,
            }
        )
        with patch(f"{module}.NewsCategories.find_live", return_value=Mock()), patch(
            f"{module}.News"
        ), patch(f"{module}.Cache"), patch(f"{module}.KioskBroadcast"), patch(
            f"{module}.NewNews"
        ), patch(
            f"{module}.generate_variants"
        ):
            NewsController().store(request, storage, Mock())
        return storage

    def test_a_real_image_is_stored_for_a_story(self):
        storage = self._store_news(_upload(GIF, ".gif"))
        storage.disk.return_value.put_file.assert_called_once()

    def test_a_page_named_as_an_image_is_not_stored_for_a_story(self):
        storage = self._store_news(_upload(HTML, ".png"))
        storage.disk.return_value.put_file.assert_not_called()

    def _upload_hymn(self, content):
        from app.controllers.kiosk.AboutController import AboutController

        module = "app.controllers.kiosk.AboutController"
        with tempfile.TemporaryDirectory() as base, patch(
            f"{module}.gearsnas_base", return_value=base
        ), patch(f"{module}.AboutSection"), patch(f"{module}._about_changed"):
            AboutController().upload_hymn_audio(
                _request({"file": _upload(content, ".mp3")}), Mock()
            )
            return os.path.exists(os.path.join(base, "About", "hymn_audio.mp3"))

    def test_a_page_named_as_audio_is_not_stored(self):
        self.assertFalse(self._upload_hymn(HTML))

    def test_real_audio_is_stored(self):
        self.assertTrue(self._upload_hymn(TAGGED_MP3))
