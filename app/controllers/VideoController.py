from masonite.controllers import Controller
from masonite.request import Request
from masonite.filesystem import Storage
from masonite.utils.location import base_path
from app.models.Video import Video
from app.models.Events import Events
from app.models.Locations import Locations
from masonite.response import Response
from masonite.views import View
import os


class VideoController(Controller):
    def serve_storage(self, response: Response, path):
        path = str(path).replace("\\", "/")
        full_path = base_path(os.path.join("storage/framework/public", path))
        
        if os.path.exists(full_path):
            return response.download(os.path.basename(full_path), full_path, force=False)
        
        return  "File not Found", 404
    
    def show(self, views: View):
        videos = Video.all()
        events = Events.all()
        locations = Locations.all()

        return views.render("gears/dashboard.html", {
            "videos": videos,
            "events": events,
            "locations": locations,
        })

    def upload(self, request: Request, storage: Storage, response: Response):
        
        video_file = request.input("video")
        
        if not video_file:
            return "No video file provided", 400
        
        path = storage.disk("public").put_file("videos", video_file)
        
        Video.create(
            title=request.input("title"),
            file_path=path
        )
        
        return response.redirect(name="gears.dashboard")

    def destroy(self, request: Request, response: Response):
        video = Video.find(request.param("id"))

        if not video:
            return response.back().with_errors(["Video not found."])

        file_path = getattr(video, "file_path", "") or ""
        full_path = base_path(os.path.join("storage/framework/public", file_path))

        if os.path.exists(full_path):
            os.remove(full_path)

        video.delete()

        return response.redirect(name="gears.dashboard")