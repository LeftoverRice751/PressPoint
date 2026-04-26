from masonite.routes import Route

ROUTES = [
    Route.post("/news/dashboard", "NewsController@store").name("news.store").middleware("auth"),
]