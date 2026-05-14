from masonite.routes import Route


ROUTES = [
    Route.get("/", "WelcomeController@show"),
    Route.get("/kiosk", "WelcomeController@show").name("kiosk"),
    Route.get("/kiosk/gears-archive", "ArchivesController@show").name("kiosk.gears-archive"),
    Route.get("/kiosk/archives/@id/pages/@page", "ArchivesController@page").name("kiosk.archive-page"),
    Route.get("/kiosk/flash-updates", "WelcomeController@flash_updates").name("welcome.flash-updates"),
    Route.get("/kiosk/latest-news", "NewsController@show").name("kiosk.latest-news"),
    Route.get("/kiosk/campus-map", "MapController@show").name("kiosk.campus-map"),
    Route.get("/kiosk/ai-assistant", "WelcomeController@ai_assistant").name("kiosk.ai-assistant"),
    Route.get("/kiosk/virtual-tour", "WelcomeController@virtual_tour").name("kiosk.virtual-tour"),
    Route.get("/kiosk/about-lspu", "AboutController@kiosk").name("kiosk.about-lspu"),
    Route.get("/kiosk/org-board", "OrgBoardController@public_show").name("kiosk.org-board"),
    Route.get("/kiosk/org-chart", "WelcomeController@org_chart").name("kiosk.org-chart"),
    Route.post("/trigger-video", "EditorialController@play_video").name("video.push").middleware("auth"),
    Route.get("/storage/@path:any", "VideoController@serve_storage"),
]
