from masonite.routes import Route


ROUTES = [
    Route.get("/api/locations", "kiosk.MapController@get_locations"),
    Route.get("/api/tour-scenes", "kiosk.TourController@mappings"),

    # Kiosk -> server: mint a QR-shared route session.
    Route.post("/api/route-sessions", "kiosk.MapController@create_route_session").middleware("throttle:route-sessions"),

    # Phone -> server: read the route to draw, and mark it finished.
    Route.get("/api/route-sessions/@token", "kiosk.MapController@route_session_data"),
    Route.post("/api/route-sessions/@token/finish", "kiosk.MapController@finish_route_session"),

    # Public mobile landing page (no auth, token in URL).
    Route.get("/m/route/@token", "kiosk.MapController@mobile_route").name("mobile.route"),

    # Offline cache for the mobile-route page -- see MapController.serve_sw.
    Route.get("/sw-mobile-route.js", "kiosk.MapController@serve_sw"),
]
