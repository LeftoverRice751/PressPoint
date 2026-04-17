from masonite.routes import Route


ROUTES = [
    Route.post("/kiosk/lock", "KioskController@lock").name("kiosk.lock").middleware("auth"),
    Route.post("/kiosk/unlock", "KioskController@unlock").name("kiosk.unlock").middleware("auth"),
    Route.get("/gears/dashboard", "VideoController@show").name("gears.dashboard").middleware("auth"),
    Route.post("/videos/dashboard", "VideoController@upload").name("video.upload").middleware('throttle:5,1'),
    Route.delete("/videos/dashboard/@id", "VideoController@destroy").name("video.destroy").middleware("auth"),
    Route.post("/events/dashboard", "EventController@store").name("events.store").middleware("auth"),
    Route.post("/events/dashboard/archive", "EventController@extract_from_pdf").name("events.archive").middleware("auth"),
    Route.post("/news/dashboard", "NewsController@store").name("news.store").middleware("auth"),
]
