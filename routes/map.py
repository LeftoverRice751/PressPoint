from masonite.routes import Route

ROUTES = [
    Route.get("/api/locations", "MapController@get_locations"),
]