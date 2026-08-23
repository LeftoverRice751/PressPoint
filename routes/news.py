from masonite.routes import Route

ROUTES = [
    Route.post("/news/dashboard", "gears.NewsController@store").name("news.store").middleware("auth"),
]