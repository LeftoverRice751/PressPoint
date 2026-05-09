from masonite.routes import Route


ROUTES = [
    Route.post("/kiosk/lock", "KioskController@lock").name("kiosk.lock").middleware("auth"),
    Route.post("/kiosk/unlock", "KioskController@unlock").name("kiosk.unlock").middleware("auth"),
    Route.get("/gears/dashboard", "VideoController@show").name("gears.dashboard").middleware("auth"),
    Route.post("/videos/dashboard", "VideoController@upload").name("video.upload").middleware("auth"),
    Route.delete("/videos/dashboard/@id", "VideoController@destroy").name("video.destroy").middleware("auth"),
    Route.post("/archives/dashboard", "ArchivesController@store").name("archives.store").middleware("auth"),
    Route.delete("/archives/dashboard/@id", "ArchivesController@destroy").name("archives.destroy").middleware("auth"),
    Route.post("/events/dashboard", "EventController@store").name("events.store").middleware("auth"),
    Route.post("/events/dashboard/archive", "EventController@extract_from_pdf").name("events.archive").middleware("auth"),
    Route.post("/news/dashboard", "NewsController@store").name("news.store").middleware("auth"),
    Route.post("/tour-scenes/dashboard", "TourController@store").name("tour-scenes.store").middleware("auth"),

    # About LSPU editor
    Route.get ("/gears/about-lspu",                            "AboutController@editor").name("gears.about-lspu").middleware("auth"),
    Route.post("/gears/about-lspu/sections/@slug",             "AboutController@save_section").middleware("auth"),
    Route.post("/gears/about-lspu/milestones",                 "AboutController@create_milestone").middleware("auth"),
    Route.post("/gears/about-lspu/milestones/@id",             "AboutController@update_milestone").middleware("auth"),
    Route.post("/gears/about-lspu/milestones/@id/delete",      "AboutController@delete_milestone").middleware("auth"),
    Route.post("/gears/about-lspu/milestones/@id/reorder",     "AboutController@reorder_milestone").middleware("auth"),
    Route.post("/gears/about-lspu/seal/upload",                "AboutController@upload_seal").middleware("auth"),
]
