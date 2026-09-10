from masonite.routes import Route


ROUTES = [
    Route.get("/", "kiosk.ArchivesController@mobile").name("mobile.archives"),
    # ── The kiosk shell ──────────────────────────────────────────────────
    #
    # /kiosk and all six section paths serve the SAME document: the carousel
    # shell, with the section resolved from the path so a deep link paints
    # with its content already in the frame. The section routes are grouped
    # below with their embed counterparts rather than left in the flat list
    # they used to be in, because the pairing is the thing to understand.
    Route.get("/kiosk", "kiosk.KioskShellController@show").name("kiosk"),
    Route.get("/kiosk/archives/@id/pages/@page", "kiosk.ArchivesController@page").middleware("throttle:archive-pages").name("kiosk.archive-page"),
    # Phone-sized skin over the same ArchivesController payload. Lives under
    # /m/ alongside /m/route/@token rather than sniffing the User-Agent on
    # "/" -- the kiosk is itself a touch device, so UA sniffing would hand
    # the kiosk terminal the phone layout.
    Route.get("/m/archives", "kiosk.ArchivesController@mobile").name("mobile.archives"),
    Route.get("/kiosk/flash-updates", "kiosk.WelcomeController@flash_updates").name("welcome.flash-updates"),
    # Lets sw-kiosk.js serve kiosk documents from cache -- see the docstring on
    # WelcomeController.csrf for why the token had to leave the HTML first.
    Route.get("/kiosk/csrf", "kiosk.WelcomeController@csrf").name("kiosk.csrf"),
    # ── Sections: one visitor-facing path + one frame-facing path each ───
    #
    # The left column is what the visitor sees and what history.pushState()
    # writes; every one of them serves the shell. The right column is what the
    # shell's content frame actually loads, and each points at the SAME,
    # unchanged controller that used to serve the left-hand path directly — no
    # destination template or controller is duplicated here, only routed twice.
    #
    # They have to be different URLs. The shell is served at the visitor-facing
    # path so a deep link arrives with its section active; if the frame loaded
    # that same path it would load the shell inside the shell, without end.
    #
    # Keep in step with app/services/KioskSections.py, which is what the
    # carousel renders from and what resolves a path back to a section.
    Route.get("/kiosk/latest-news", "kiosk.KioskShellController@show").name("kiosk.latest-news"),
    Route.get("/kiosk/embed/latest-news", "gears.NewsController@show").name("kiosk.embed.latest-news"),

    Route.get("/kiosk/campus-map", "kiosk.KioskShellController@show").name("kiosk.campus-map"),
    Route.get("/kiosk/embed/campus-map", "kiosk.MapController@show").name("kiosk.embed.campus-map"),

    Route.get("/kiosk/gears-archive", "kiosk.KioskShellController@show").name("kiosk.gears-archive"),
    Route.get("/kiosk/embed/gears-archive", "kiosk.ArchivesController@show").name("kiosk.embed.gears-archive"),

    Route.get("/kiosk/virtual-tour", "kiosk.KioskShellController@show").name("kiosk.virtual-tour"),
    Route.get("/kiosk/embed/virtual-tour", "kiosk.WelcomeController@virtual_tour").name("kiosk.embed.virtual-tour"),

    Route.get("/kiosk/about-lspu", "kiosk.KioskShellController@show").name("kiosk.about-lspu"),
    Route.get("/kiosk/embed/about-lspu", "kiosk.AboutController@kiosk").name("kiosk.embed.about-lspu"),

    Route.get("/kiosk/org-board", "kiosk.KioskShellController@show").name("kiosk.org-board"),
    Route.get("/kiosk/embed/org-board", "gears.OrgBoardController@public_show").name("kiosk.embed.org-board"),

    # Unchanged: a legacy alias that redirects to /kiosk/org-board.
    Route.get("/kiosk/org-chart", "kiosk.WelcomeController@org_chart").name("kiosk.org-chart"),
    Route.get("/kiosk/idle-video", "gears.VideoController@idle_video").name("kiosk.idle_video"),
    Route.post("/trigger-video", "gears.EditorialController@play_video").name("video.push").middleware("auth"),
    Route.get("/storage/@path:any", "gears.VideoController@serve_storage"),
    Route.get("/sw-archives.js", "gears.VideoController@serve_sw"),
    # Offline shell for the kiosk terminal -- see WelcomeController.serve_sw.
    Route.get("/sw-kiosk.js", "kiosk.WelcomeController@serve_sw"),
]
