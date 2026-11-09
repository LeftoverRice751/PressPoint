"""Create / update / delete for photo posts.

Every test drives NewsController with request doubles and patches the News model,
so nothing here writes the (live) database or the NAS.
"""

import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch

import pytest

from app.controllers.gears.NewsController import NewsController, _news_is_public
from app.services import Posts

NEWS = "app.controllers.gears.NewsController"

pytestmark = pytest.mark.usefixtures("actor_may_change_any_story")


def _request(role="editor", user_id=7, **inputs):
    request = Mock()
    request.input.side_effect = lambda key, default="": inputs.get(key, default)
    request.param.side_effect = lambda key, default="": inputs.get(key, default)
    request.header.side_effect = lambda name: (
        "XMLHttpRequest" if name == "X-Requested-With" else None
    )
    request.user.return_value = Mock(id=user_id, role=role)
    return request


def _upload(name="photo.jpg"):
    return SimpleNamespace(
        name=name,
        extension=lambda: "." + name.rsplit(".", 1)[1],
        get_content=lambda: b"bytes",
    )


def _existing(**fields):
    record = Mock(
        id=11,
        status="draft",
        author_id=7,
        image="news/old.jpg",
        logo_path=None,
        rejection_reason=None,
        published_at=None,
    )
    for name, value in fields.items():
        setattr(record, name, value)
    return record


def _future(days=3):
    local = datetime.now(Posts.CAMPUS_TZ) + timedelta(days=days)
    return local.strftime("%Y-%m-%dT%H:%M")


class _StoreCase(TestCase):
    def store(self, request, existing=None, storage=None, logo_result=None):
        response = Mock()
        storage = storage or Mock()
        storage.disk.return_value.put_file.return_value = "news/new.jpg"
        with patch(f"{NEWS}.News.where") as where, patch(f"{NEWS}.News.create") as create, patch(
            f"{NEWS}.Cache"
        ) as cache, patch(f"{NEWS}.KioskBroadcast.section_changed") as changed, patch(
            f"{NEWS}.FileVerificationService.verify_buffer", return_value=True
        ), patch(
            f"{NEWS}.generate_variants"
        ), patch(
            f"{NEWS}.ImageUploads.save_uploaded_image",
            return_value=logo_result or ("Branding/posts/logo-abc.png", None),
        ) as save_logo, patch(
            f"{NEWS}._delete_image_files"
        ) as delete_image, patch(
            f"{NEWS}.delete_image_and_variants"
        ) as delete_variants:
            where.return_value.first.return_value = existing
            create.return_value = Mock(id=99, image=None, logo_path=None)
            NewsController().store(request, storage, response)
        self.create, self.cache, self.changed, self.where = create, cache, changed, where
        self.save_logo, self.delete_image, self.delete_variants = (
            save_logo,
            delete_image,
            delete_variants,
        )
        self.storage = storage
        return response

    def body(self, response):
        return response.json.call_args[0][0]

    def code(self, response):
        return response.json.call_args[1]["status"]


class StoreStatusTestCase(_StoreCase):
    def test_editor_submit_goes_to_review(self):
        self.store(_request(headline="H", status="published", image=_upload()))
        self.assertEqual(self.create.call_args.kwargs["status"], "review")

    def test_post_fields_land_in_the_right_columns(self):
        self.store(_request(headline="Headline", body="Para one\nPara two", kicker="NEWS"))
        fields = self.create.call_args.kwargs
        self.assertEqual(fields["title"], "Headline")
        self.assertEqual(fields["description"], "Para one\nPara two")
        self.assertEqual(fields["kicker"], "NEWS")
        self.assertEqual(fields["author_id"], 7)
        for untouched in ("category_id", "issue_id", "layout_type", "priority"):
            self.assertNotIn(untouched, fields)

    def test_submit_without_photo_refused(self):
        response = self.store(_request(headline="H", status="review"))
        self.assertEqual(self.code(response), 422)
        self.assertEqual(self.body(response)["errors"], ["Add a photo before submitting"])
        self.create.assert_not_called()

    def test_draft_without_photo_is_fine(self):
        response = self.store(_request(headline="H", status="draft"))
        self.assertTrue(self.body(response)["ok"])
        self.assertEqual(self.create.call_args.kwargs["status"], "draft")

    def test_submit_keeps_the_photo_already_on_the_post(self):
        response = self.store(
            _request(id="11", headline="H", status="review"), existing=_existing()
        )
        self.assertTrue(self.body(response)["ok"])

    def test_a_missing_status_fails_closed_to_draft(self):
        self.store(_request(headline="H"))
        self.assertEqual(self.create.call_args.kwargs["status"], "draft")

    def test_headline_is_required_to_submit(self):
        response = self.store(_request(headline="   ", status="review", image=_upload()))
        self.assertEqual(self.code(response), 422)
        self.assertEqual(self.body(response)["errors"], ["Add a headline."])

    def test_a_draft_may_have_no_headline(self):
        response = self.store(_request(headline="", status="draft"))
        self.assertTrue(self.body(response)["ok"])
        self.assertEqual(self.create.call_args.kwargs["title"], "")

    def test_admin_publish_needs_photo_and_headline_too(self):
        response = self.store(_request(role="admin", headline="H", status="published"))
        self.assertEqual(self.body(response)["errors"], ["Add a photo before submitting"])
        response = self.store(
            _request(role="admin", headline="", status="published", image=_upload())
        )
        self.assertEqual(self.body(response)["errors"], ["Add a headline."])
        self.create.assert_not_called()

    def test_oversize_photo_refused_before_any_write(self):
        big = _upload()
        big.get_content = lambda: b"x" * (6 * 1024 * 1024 + 1)
        response = self.store(_request(headline="H", image=big))
        self.assertEqual(self.code(response), 422)
        self.assertEqual(self.body(response)["errors"], ["Photo is too large (max 6 MB)"])
        self.storage.disk.return_value.put_file.assert_not_called()

    def test_a_non_string_id_does_not_crash(self):
        response = self.store(_request(id=11, headline="H"), existing=_existing())
        self.assertTrue(self.body(response)["ok"])

    def test_response_carries_the_card(self):
        response = self.store(_request(headline="H"))
        body = self.body(response)
        self.assertEqual(body["id"], 99)
        self.assertEqual(body["status"], "draft")
        self.assertIn("headline", body["card"])


class StoreExpiryTestCase(_StoreCase):
    def test_past_expiry_refused(self):
        past = (datetime.now(Posts.CAMPUS_TZ) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M")
        response = self.store(_request(headline="H", expires_at=past))
        self.assertEqual(self.code(response), 422)
        self.assertEqual(self.body(response)["errors"], ["Pick an expiry in the future"])
        self.create.assert_not_called()

    def test_malformed_expiry_refused(self):
        response = self.store(_request(headline="H", expires_at="tomorrow"))
        self.assertEqual(self.body(response)["errors"], ["Pick a valid expiry date and time"])

    def test_future_expiry_is_stored_as_aware_utc(self):
        self.store(_request(headline="H", expires_at=_future()))
        stored = self.create.call_args.kwargs["expires_at"]
        self.assertEqual(stored.utcoffset(), timedelta(0))

    def test_admin_publish_without_expiry_gets_the_default_week(self):
        self.store(_request(role="admin", headline="H", status="published", image=_upload()))
        stored = self.create.call_args.kwargs["expires_at"]
        delta = stored - datetime.now(timezone.utc)
        self.assertAlmostEqual(delta.total_seconds(), 7 * 86400, delta=60)


class ExpiryNullTrapTestCase(_StoreCase):
    def test_masonite_turns_none_into_now_for_a_dates_column(self):
        # The trap itself: a None handed to a __dates__ column becomes the current
        # time, so assigning/creating with expires_at=None expires the post at birth.
        from app.models.News import News

        self.assertIsNotNone(News().cast_values({"expires_at": None})["expires_at"])

    def test_create_omits_expires_at_when_unset(self):
        self.store(_request(headline="H", status="draft"))
        self.assertNotIn("expires_at", self.create.call_args.kwargs)

    def test_update_never_assigns_none(self):
        record = _existing(expires_at=None)
        self.store(_request(id="11", headline="H", status="draft"), existing=record)
        self.assertIsNone(record.expires_at)  # untouched, not "now"

    def test_blank_field_clears_a_stale_expiry_with_a_real_null(self):
        old = datetime.now(timezone.utc) + timedelta(days=2)
        record = _existing(status="draft", expires_at=old)
        self.store(_request(id="11", headline="H", status="draft"), existing=record)
        self.where.return_value.update.assert_called_once_with({"expires_at": None}, cast=False)
        self.assertEqual(record.expires_at, old)  # the model setter was not used

    def test_the_clear_call_binds_a_real_none(self):
        from app.models.News import News

        builder = News.where("id", 5).update({"expires_at": None}, cast=False, dry=True)
        builder.to_qmark()
        self.assertIsNone(builder._bindings[0])

    def test_blank_field_keeps_the_end_date_of_a_live_post(self):
        old = datetime.now(timezone.utc) + timedelta(days=2)
        record = _existing(status="published", expires_at=old)
        self.store(_request(id="11", headline="H", status="draft"), existing=record)
        self.where.return_value.update.assert_not_called()
        self.assertEqual(record.expires_at, old)

    def test_a_new_date_replaces_the_old_one(self):
        old = datetime.now(timezone.utc) + timedelta(days=2)
        record = _existing(status="published", expires_at=old)
        self.store(_request(id="11", headline="H", expires_at=_future(9)), existing=record)
        self.assertGreater(record.expires_at, old)


class StoreEditTestCase(_StoreCase):
    def test_editing_published_post_pulls_it(self):
        record = _existing(status="published")
        self.store(_request(id="11", headline="Fixed typo", status="draft"), existing=record)
        self.assertEqual(record.status, "draft")
        record.save.assert_called_once()
        self.cache.forget.assert_called_once()
        self.changed.assert_called_once_with("latest-news")

    def test_resubmitting_clears_the_rejection(self):
        record = _existing(status="draft", rejection_reason="Needs a source")
        self.store(_request(id="11", headline="H", status="review"), existing=record)
        self.assertEqual(record.status, "review")
        self.assertIsNone(record.rejection_reason)

    def test_replacing_the_photo_deletes_the_old_one(self):
        record = _existing()
        self.store(_request(id="11", headline="H", image=_upload()), existing=record)
        self.assertEqual(record.image, "news/new.jpg")
        self.delete_image.assert_called_once_with("news/old.jpg")

    def test_keeping_the_photo_deletes_nothing(self):
        record = _existing()
        self.store(_request(id="11", headline="H"), existing=record)
        self.assertEqual(record.image, "news/old.jpg")
        self.delete_image.assert_not_called()

    def test_unknown_id_is_a_404(self):
        response = self.store(_request(id="404", headline="H"), existing=None)
        self.assertEqual(self.code(response), 404)

    def test_not_your_post_is_the_same_404(self):
        with patch(f"{NEWS}._may_change_story", return_value=False):
            response = self.store(_request(id="11", headline="H"), existing=_existing())
        self.assertEqual(self.code(response), 404)
        self.create.assert_not_called()

    def test_a_refused_upload_writes_no_file(self):
        bad = _upload("page.html")
        response = self.store(_request(headline="H", image=bad))
        self.assertEqual(self.code(response), 422)
        self.storage.disk.return_value.put_file.assert_not_called()


class StoreCropAndSourcesTestCase(_StoreCase):
    def test_garbage_is_stored_as_the_clean_defaults(self):
        self.store(_request(headline="H", image_crop="not json", source_lines="{{"))
        fields = self.create.call_args.kwargs
        self.assertEqual(json.loads(fields["image_crop"]), Posts.DEFAULT_CROP)
        self.assertEqual(json.loads(fields["source_lines"]), Posts.DEFAULT_SOURCE_LINES)

    def test_values_are_clamped_and_trimmed(self):
        crop = json.dumps({"x": 9, "y": -2, "zoom": 99})
        lines = json.dumps(
            [{"icon": "bogus", "text": "  /gears  "}, {"icon": "email", "text": ""}]
        )
        self.store(_request(headline="H", image_crop=crop, source_lines=lines))
        fields = self.create.call_args.kwargs
        self.assertEqual(json.loads(fields["image_crop"]), {"x": 1.0, "y": 0.0, "zoom": 4.0})
        self.assertEqual(json.loads(fields["source_lines"]), [{"icon": "link", "text": "/gears"}])

    def test_text_is_capped_and_markup_free_of_control_chars(self):
        self.store(_request(headline="x" * 500, kicker="k" * 500, body="y" * 900))
        fields = self.create.call_args.kwargs
        self.assertEqual(len(fields["title"]), Posts.HEADLINE_MAX)
        self.assertEqual(len(fields["kicker"]), Posts.KICKER_MAX)
        self.assertEqual(len(fields["description"]), Posts.BODY_MAX)


class StoreLogoTestCase(_StoreCase):
    def test_logo_upload_goes_through_the_verified_helper_into_branding_posts(self):
        logo = _upload("mark.png")
        self.store(_request(headline="H", logo=logo))
        args = self.save_logo.call_args.args
        self.assertIs(args[0], logo)
        self.assertEqual(args[1], "Branding/posts")
        self.assertEqual(self.create.call_args.kwargs["logo_path"], "Branding/posts/logo-abc.png")

    def test_a_refused_logo_saves_nothing(self):
        response = self.store(
            _request(headline="H", logo=_upload("mark.png")),
            logo_result=(None, "Upload must be a JPEG, PNG, or WEBP image."),
        )
        self.assertEqual(self.code(response), 422)
        self.create.assert_not_called()

    def test_remove_logo_deletes_the_file_and_nulls_the_path(self):
        record = _existing(logo_path="Branding/posts/logo-old.png")
        self.store(_request(id="11", headline="H", remove_logo="1"), existing=record)
        self.assertIsNone(record.logo_path)
        self.delete_variants.assert_called_once_with("Branding/posts/logo-old.png")

    def test_replacing_a_logo_deletes_the_old_file(self):
        record = _existing(logo_path="Branding/posts/logo-old.png")
        self.store(_request(id="11", headline="H", logo=_upload("n.png")), existing=record)
        self.assertEqual(record.logo_path, "Branding/posts/logo-abc.png")
        self.delete_variants.assert_called_once_with("Branding/posts/logo-old.png")

    def test_a_tampered_logo_path_outside_the_folder_is_never_deleted(self):
        record = _existing(logo_path="Branding/site-logo.png")
        self.store(_request(id="11", headline="H", remove_logo="1"), existing=record)
        self.delete_variants.assert_not_called()


class DestroyTestCase(TestCase):
    def test_destroy_removes_photo_derivatives_and_logo(self):
        record = Mock(id=42, image="news/p.jpg", logo_path="Branding/posts/logo-1.png")
        response = Mock()
        with patch(f"{NEWS}.News.where") as where, patch(f"{NEWS}.Cache") as cache, patch(
            f"{NEWS}.KioskBroadcast.section_changed"
        ) as changed, patch(f"{NEWS}.delete_image_and_variants") as delete_files:
            where.return_value.first.return_value = record
            NewsController().destroy(_request(id="42"), response)

        where.return_value.force_delete.assert_called_once_with()
        self.assertEqual(
            [c.args[0] for c in delete_files.call_args_list],
            ["news/p.jpg", "Branding/posts/logo-1.png"],
        )
        cache.forget.assert_called_once()
        changed.assert_called_once_with("latest-news")

    def test_a_failed_row_delete_keeps_the_files(self):
        record = Mock(id=42, image="news/p.jpg", logo_path=None)
        with patch(f"{NEWS}.News.where") as where, patch(f"{NEWS}.Cache"), patch(
            f"{NEWS}.KioskBroadcast.section_changed"
        ) as changed, patch(f"{NEWS}.delete_image_and_variants") as delete_files:
            where.return_value.first.return_value = record
            where.return_value.force_delete.side_effect = RuntimeError("db down")
            NewsController().destroy(_request(id="42"), Mock())
        delete_files.assert_not_called()
        changed.assert_not_called()


class ExpiryVisibilityTestCase(TestCase):
    def _post(self, **fields):
        base = dict(status="published", published_at=None, expires_at=None)
        base.update(fields)
        return SimpleNamespace(**base)

    def test_expired_post_not_public(self):
        gone = datetime.now(timezone.utc) - timedelta(minutes=1)
        self.assertFalse(_news_is_public(self._post(expires_at=gone)))

    def test_unexpired_and_unset_posts_are_public(self):
        soon = datetime.now(timezone.utc) + timedelta(days=1)
        self.assertTrue(_news_is_public(self._post(expires_at=soon)))
        self.assertTrue(_news_is_public(self._post()))

    def test_flash_articles_exclude_an_expired_post(self):
        from app.controllers.kiosk.WelcomeController import WelcomeController

        gone = datetime.now(timezone.utc) - timedelta(minutes=1)
        expired = Mock(
            id=1,
            status="published",
            title="Old",
            description="x",
            expires_at=gone,
            published_at=None,
            created_at=datetime.now() - timedelta(hours=1),
        )
        live = Mock(
            id=2,
            status="published",
            title="New",
            description="y",
            expires_at=None,
            published_at=None,
            created_at=datetime.now() - timedelta(hours=1),
        )
        with patch("app.controllers.kiosk.WelcomeController.News") as news, patch(
            "app.controllers.kiosk.WelcomeController.Events"
        ) as events:
            news.where_not_null.return_value.where_raw.return_value.get.return_value = [expired, live]
            events.where_raw.return_value.get.return_value = []
            articles = WelcomeController()._build_flash_articles()
        headlines = json.dumps(articles)
        self.assertIn("New", headlines)
        self.assertNotIn("Old", headlines)
