from masonite.routes import Route


ROUTES = [
    Route.get("/", "WelcomeController@show"),
    Route.get("/kiosk", "WelcomeController@show").name("kiosk"),
    Route.post("/trigger-video", "EditorialController@play_video").name("video.push"),
    Route.get("/storage/@path:any", "VideoController@serve_storage"),
]
