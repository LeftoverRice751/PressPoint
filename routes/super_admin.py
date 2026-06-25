from masonite.routes import Route

ROUTES = [
    Route.get("auth/super_admin", "auth.SuperAdminController@show").name("auth.super_admin").middleware("auth", "super_admin"),
    Route.post("auth/super_admin", "auth.SuperAdminController@store").name("auth.super_admin.store").middleware("auth", "super_admin"),
    Route.delete("auth/super_admin/@id", "auth.SuperAdminController@destroy").name("auth.super_admin.destroy").middleware("auth", "super_admin")
]