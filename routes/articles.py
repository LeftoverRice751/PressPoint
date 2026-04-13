from masonite.routes import Route


ROUTES = [
    Route.post("/articles/dashboard", "ArticleController@store").name("articles.store").middleware("auth"),
]
