from masonite.routes import Route


ROUTES = [
    Route.get("/", "WelcomeController@show"),
    Route.get("/kiosk", "WelcomeController@show").name("kiosk"),
    Route.get("/kiosk/latest-news", "WelcomeController@latest_news").name("kiosk.latest-news"),
    Route.get("/kiosk/campus-map", "WelcomeController@campus_map").name("kiosk.campus-map"),
    Route.get("/kiosk/ai-assistant", "WelcomeController@ai_assistant").name("kiosk.ai-assistant"),
    Route.get("/kiosk/virtual-tour", "WelcomeController@virtual_tour").name("kiosk.virtual-tour"),
    Route.post("/trigger-video", "EditorialController@play_video").name("video.push"),
    Route.get("/storage/@path:any", "VideoController@serve_storage"),
]
