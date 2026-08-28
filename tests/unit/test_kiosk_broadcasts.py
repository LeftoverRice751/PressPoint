from unittest.mock import Mock, patch

from app.controllers.gears.EditorialController import EditorialController
from app.controllers.gears.KioskController import KioskController
from app.controllers.gears.VideoController import VideoController
from tests import TestCase


class KioskBroadcastTestCase(TestCase):
    def test_lock_broadcasts_lock_status(self):
        controller = KioskController()
        response = Mock()
        response.json.return_value = {"ok": True}

        with patch("app.controllers.gears.KioskController._pusher_configured", return_value=True), patch(
            "app.controllers.gears.KioskController.Broadcast.channel"
        ) as broadcast_channel:
            result = controller.lock(response)

        self.assertEqual(result, {"ok": True})
        broadcast_channel.assert_called_once_with(
            ["kiosk-channel"],
            "app.events.LockKioskEvent",
            {"status": "lock"},
        )
        response.json.assert_called_once_with(
            {"ok": True, "status": "lock", "broadcast": True}
        )

    def test_unlock_broadcasts_unlock_status(self):
        controller = KioskController()
        response = Mock()
        response.json.return_value = {"ok": True}

        with patch("app.controllers.gears.KioskController._pusher_configured", return_value=True), patch(
            "app.controllers.gears.KioskController.Broadcast.channel"
        ) as broadcast_channel:
            result = controller.unlock(response)

        self.assertEqual(result, {"ok": True})
        broadcast_channel.assert_called_once_with(
            ["kiosk-channel"],
            "app.events.LockKioskEvent",
            {"status": "unlock"},
        )
        response.json.assert_called_once_with(
            {"ok": True, "status": "unlock", "broadcast": True}
        )


class VideoBroadcastTestCase(TestCase):
    def test_editorial_play_video_broadcasts_video_payload(self):
        controller = EditorialController()
        request = Mock()
        request.input.side_effect = lambda key: {"src": "/storage/videos/clip.mp4", "title": "Clip"}.get(
            key
        )
        response = Mock()
        response.json.return_value = {"ok": True}

        with patch("app.controllers.gears.EditorialController._pusher_configured", return_value=True), patch(
            "app.controllers.gears.EditorialController.Broadcast.channel"
        ) as broadcast_channel:
            result = controller.play_video(request, response)

        self.assertEqual(result, {"ok": True})
        broadcast_channel.assert_called_once_with(
            ["editorial"],
            "play-video",
            {"src": "/storage/videos/clip.mp4", "title": "Clip"},
        )
        response.json.assert_called_once_with({"ok": True, "broadcast": True})

    def test_upload_broadcasts_saved_video_path(self):
        controller = VideoController()
        video_file = Mock(
            name="campus-update.mp4",
            extension=lambda: ".mp4",
            get_content=lambda: b"video-bytes",
        )
        request = Mock()
        request.input.side_effect = lambda key: {"title": "Campus Update", "video": video_file}.get(
            key
        )
        # A plain form post, not AJAX. Without this every request.header() call
        # hands AjaxResponses.wants_json a Mock, which it substring-matches
        # against and blows up on; a bare Mock() request stopped being a
        # sufficient stand-in once upload() grew its JSON branch. None is what
        # Masonite returns for a header the browser did not send, so this is
        # the redirect-with-flash path the assertions below describe.
        request.header.return_value = None

        storage_disk = Mock()
        storage_disk.put_file.return_value = "videos/campus-update.mp4"
        storage = Mock()
        storage.disk.return_value = storage_disk

        created_video = Mock(title="Campus Update")
        response = Mock()
        redirect_response = Mock()
        redirect_response.with_success.return_value = "redirected"
        response.redirect.return_value = redirect_response

        with patch("app.controllers.gears.VideoController.Video.create", return_value=created_video), patch(
            "app.controllers.gears.VideoController._broadcast_play_video", return_value=True
        ) as broadcast_play_video:
            result = controller.upload(request, storage, response)

        self.assertEqual(result, "redirected")
        storage_disk.put_file.assert_called_once()
        broadcast_play_video.assert_called_once_with(
            "/storage/videos/campus-update.mp4",
            "Campus Update",
        )
        response.redirect.assert_called_once_with(
            name="gears.dashboard", query_params={"page": "video-manager"}
        )
        redirect_response.with_success.assert_called_once_with(["Video saved successfully."])
