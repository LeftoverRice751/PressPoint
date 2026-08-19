from masonite.routes import Route


ROUTES = [
    Route.get("/api/locations", "MapController@get_locations"),
    Route.get("/api/tour-scenes", "TourController@mappings"),

    # Kiosk -> server: mint a QR-shared route session.
    Route.post("/api/route-sessions", "MapController@create_route_session").middleware("throttle:route-sessions"),

    # Phone -> server: read the route to draw, and mark it finished.
    Route.get("/api/route-sessions/@token", "MapController@route_session_data"),
    Route.post("/api/route-sessions/@token/finish", "MapController@finish_route_session"),

    # Public mobile landing page (no auth, token in URL).
    Route.get("/m/route/@token", "MapController@mobile_route").name("mobile.route"),
]
