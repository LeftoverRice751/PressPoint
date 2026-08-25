from masonite.routes import Route

ROUTES = [
    Route.get("auth/super_admin", "auth.SuperAdminController@show").name("auth.super_admin").middleware("auth", "super_admin"),
    Route.post("auth/super_admin", "auth.SuperAdminController@store").name("auth.super_admin.store").middleware("auth", "super_admin"),
    Route.delete("auth/super_admin/@id", "auth.SuperAdminController@destroy").name("auth.super_admin.destroy").middleware("auth", "super_admin"),
    # POST, not GET: logging out is a state change, so it goes through the CSRF
    # check like every other mutation here. Only "auth" guards it -- gating
    # logout behind "super_admin" too would strand a session whose role changed
    # underneath it with no way to sign out.
    Route.post("auth/super_admin/logout", "auth.SuperAdminController@logout").name("auth.super_admin.logout").middleware("auth"),
]