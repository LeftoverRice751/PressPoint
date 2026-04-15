from masonite.routes import Route


ROUTES = [
    Route.post("/articles/dashboard", "EventController@store").name("articles.store").middleware("auth"),
]
