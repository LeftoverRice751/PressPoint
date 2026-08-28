from masonite.routes import Route


ROUTES = [
    Route.get("/login", "auth.LoginController@show").name("auth.login"),
    Route.post("/login", "auth.LoginController@store").middleware("throttle:auth").name("auth.login.store"),
    Route.get("/forgot-password", "auth.PasswordResetController@show").name("auth.forgot-password"),
    Route.get("/forgot-password/otp", "auth.PasswordResetController@show_otp").name("auth.forgot-password.otp"),
    Route.post("/forgot-password", "auth.PasswordResetController@store").middleware("throttle:password-reset").name("auth.forgot-password.store"),
    Route.post("/forgot-password/otp", "auth.PasswordResetController@verify_otp").middleware("throttle:otp").name("auth.forgot-password.otp.store"),
    Route.post("/logout", "auth.LoginController@logout").name("auth.logout"),
    Route.get("/users", "gears.UserController@view").name("users.view").middleware("auth", "admin"),
    Route.post("/users", "gears.UserController@store").name("users.store").middleware("auth", "admin"),
    Route.delete("/users/@id", "gears.UserController@destroy").name("users.destroy").middleware("auth", "admin"),
    # Declared before the "/users/@id" wildcard would ever be consulted for a
    # POST, and guarded by "auth" alone rather than "auth", "admin": a session
    # that has lost its admin role still needs a way out.
    Route.post("/users/logout", "gears.UserController@logout").name("users.logout").middleware("auth"),
    Route.post("/change-password", "auth.PasswordResetController@store_changed_password").middleware("throttle:password-reset").name("auth.change-password.store"),
    Route.get("/change-password", "auth.PasswordResetController@change_password").name("auth.change-password"),
]
