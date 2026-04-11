from masonite.controllers import Controller
from masonite.request import Request
from masonite.filesystem import Storage
from masonite.utils.location import base_path
from app.models.Categories import Categories
from app.models.Posts import Posts
from app.models.Video import Video
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
        posts = sorted(list(Posts.all() or []), key=lambda item: getattr(item, "id", 0), reverse=True)
        categories = sorted(list(Categories.all() or []), key=lambda item: getattr(item, "id", 0))
        videos = sorted(list(Video.all() or []), key=lambda item: getattr(item, "id", 0), reverse=True)
        locations = sorted(list(Locations.all() or []), key=lambda item: getattr(item, "id", 0))

        published_articles = [
            post for post in posts if (getattr(post, "status", "") or "").lower() == "published"
        ]

        category_rows = []
        category_lookup = {getattr(category, "id", None): getattr(category, "name", "") for category in categories}
        for category in categories:
            article_items = [
                post for post in posts if getattr(post, "category_id", None) == getattr(category, "id", None)
            ]
            category_rows.append(
                {
                    "name": getattr(category, "name", "Untitled category"),
                    "count": len(article_items),
                    "percent": round((len(article_items) / len(posts)) * 100) if posts else 0,
                    "items": article_items[:3],
                }
            )

        uncategorized_posts = [
            post for post in posts if not getattr(post, "category_id", None)
        ]
        if uncategorized_posts:
            category_rows.append(
                {
                    "name": "Uncategorized",
                    "count": len(uncategorized_posts),
                    "percent": round((len(uncategorized_posts) / len(posts)) * 100) if posts else 0,
                    "items": uncategorized_posts[:3],
                }
            )

        recent_articles = posts[:5]

        return views.render("gears/dashboard.html", {
            "posts": posts,
            "categories": categories,
            "videos": videos,
            "locations": locations,
            "recent_articles": recent_articles,
            "article_groups": category_rows,
            "category_lookup": category_lookup,
            "total_articles": len(posts),
            "published_articles": len(published_articles),
            "location_count": len(locations),
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