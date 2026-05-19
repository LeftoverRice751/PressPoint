from masonite.routes import Route

ROUTES = [
    Route.get("/news-editor", "auth.NewsEditorLoginController@show"),
    Route.get("/news-editor/login", "auth.NewsEditorLoginController@show").name("auth.news-editor.login"),
    Route.post("/news-editor/login", "auth.NewsEditorLoginController@store").name("auth.news-editor.store"),
    Route.get("/news-editor/logout", "auth.NewsEditorLoginController@logout").name("auth.news-editor.logout"),
    Route.get("/gears/news-editor", "NewsController@news_editor").name("news_editor.dashboard").middleware("news_editor"),
    Route.post("/news-editor/notifications/@id/read", "NotificationController@mark_read").name("notifications.read").middleware("news_editor"),
    Route.post("/news-editor/notifications/read-all", "NotificationController@mark_all_read").name("notifications.read_all").middleware("news_editor"),
]