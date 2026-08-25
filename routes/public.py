from masonite.routes import Route


ROUTES = [
    Route.get("/", "kiosk.ArchivesController@mobile").name("mobile.archives"),
    Route.get("/kiosk", "kiosk.WelcomeController@show").name("kiosk"),
    Route.get("/kiosk/gears-archive", "kiosk.ArchivesController@show").name("kiosk.gears-archive"),
    Route.get("/kiosk/archives/@id/pages/@page", "kiosk.ArchivesController@page").middleware("throttle:archive-pages").name("kiosk.archive-page"),
    # Phone-sized skin over the same ArchivesController payload. Lives under
    # /m/ alongside /m/route/@token rather than sniffing the User-Agent on
    # "/" -- the kiosk is itself a touch device, so UA sniffing would hand
    # the kiosk terminal the phone layout.
    Route.get("/m/archives", "kiosk.ArchivesController@mobile").name("mobile.archives"),
    Route.get("/kiosk/flash-updates", "kiosk.WelcomeController@flash_updates").name("welcome.flash-updates"),
    Route.get("/kiosk/latest-news", "gears.NewsController@show").name("kiosk.latest-news"),
    Route.get("/kiosk/campus-map", "kiosk.MapController@show").name("kiosk.campus-map"),
    Route.get("/kiosk/virtual-tour", "kiosk.WelcomeController@virtual_tour").name("kiosk.virtual-tour"),
    Route.get("/kiosk/about-lspu", "kiosk.AboutController@kiosk").name("kiosk.about-lspu"),
    Route.get("/kiosk/org-board", "gears.OrgBoardController@public_show").name("kiosk.org-board"),
    Route.get("/kiosk/org-chart", "kiosk.WelcomeController@org_chart").name("kiosk.org-chart"),
    Route.get("/kiosk/idle-video", "gears.VideoController@idle_video").name("kiosk.idle_video"),
    Route.post("/trigger-video", "gears.EditorialController@play_video").name("video.push").middleware("auth"),
    Route.get("/storage/@path:any", "gears.VideoController@serve_storage"),
    Route.get("/sw-archives.js", "gears.VideoController@serve_sw"),
    # Offline shell for the kiosk terminal -- see WelcomeController.serve_sw.
    Route.get("/sw-kiosk.js", "kiosk.WelcomeController@serve_sw"),
]
