from masonite.routes import Route

ROUTES = [
    Route.get("/", "WelcomeController@show"),
    Route.get("/kiosk", "WelcomeController@show").name("kiosk"),
    Route.post("/trigger-video", "EditorialController@play_video").name("video.push"),
    Route.get("/gears/dashboard", "VideoController@show").name("gears.dashboard").middleware("auth"),
    Route.post("/videos/dashboard", "VideoController@upload").name("video.upload"),
    Route.delete("/videos/dashboard/@id", "VideoController@destroy").name("video.destroy").middleware("auth"),
    Route.get("/storage/@path:any", "VideoController@serve_storage"),
    Route.get("/login", "auth.LoginController@show").name("auth.login"),
    Route.post("/login", "auth.LoginController@store").name("auth.login.store"),
    Route.get("/forgot-password", "auth.PasswordResetController@show").name("auth.forgot-password"),
    Route.get("/forgot-password/otp", "auth.PasswordResetController@show_otp").name("auth.forgot-password.otp"),
    Route.post("/forgot-password", "auth.PasswordResetController@store").name("auth.forgot-password.store"),
    Route.post("/forgot-password/otp", "auth.PasswordResetController@verify_otp").name("auth.forgot-password.otp.store"),
    Route.get("/logout", "auth.LoginController@logout").name("auth.logout"),
    Route.get("/home", "auth.HomeController@show").name("auth.home").middleware("auth"),
    Route.get("/users", "UserController@view").name("users.view").middleware("auth"),
    Route.post("/users", "UserController@store").name("users.store").middleware("auth"),
    Route.delete("/users/@id", "UserController@destroy").name("users.destroy").middleware("auth"),
    Route.post("/change-password/@token", "auth.PasswordResetController@store_changed_password").name("auth.change-password.store"),
    Route.get("/change-password/@token", "auth.PasswordResetController@change_password").name("auth.change-password"),
]
