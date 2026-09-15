from masonite.routes import Route


ROUTES = [
    Route.post("/kiosk/lock", "gears.KioskController@lock").name("kiosk.lock").middleware("auth"),
    Route.post("/kiosk/unlock", "gears.KioskController@unlock").name("kiosk.unlock").middleware("auth"),
    Route.get("/gears/dashboard", "gears.DashboardController@show").name("gears.dashboard").middleware("auth"),
    Route.get("/gears/dashboard/fragment/@section", "gears.DashboardController@fragment").name("gears.dashboard.fragment").middleware("auth"),
    Route.get("/gears/dashboard/stamps", "gears.DashboardController@stamps").name("gears.dashboard.stamps").middleware("auth"),
    Route.post("/videos/dashboard", "gears.VideoController@upload").name("video.upload").middleware("auth"),
    Route.delete("/videos/dashboard/@id", "gears.VideoController@destroy").name("video.destroy").middleware("auth"),
    Route.post("/videos/dashboard/@id/idle", "gears.VideoController@set_idle").name("video.idle.set").middleware("auth"),
    Route.post("/videos/dashboard/@id/idle/clear", "gears.VideoController@clear_idle").name("video.idle.clear").middleware("auth"),
    Route.post("/archives/dashboard", "kiosk.ArchivesController@store").name("archives.store").middleware("auth"),
    Route.delete("/archives/dashboard/@id", "kiosk.ArchivesController@destroy").name("archives.destroy").middleware("auth"),
    Route.post("/events/dashboard", "gears.EventController@store").name("events.store").middleware("auth"),
    Route.post("/events/dashboard/archive", "gears.EventController@extract_from_pdf").name("events.archive").middleware("auth"),
    # Editorial review. These are the first role-gated routes in this file —
    # everything else here is "auth" only, so any signed-in account reaches it.
    # Approving puts a story on a public campus screen, so it takes "admin".
    # The issue as a unit. An editor submits an issue in one click; these are
    # the admin's matching single actions.
    #
    # The per-story routes below constrain `@id:int` so that the literal
    # segment "issue" can never match them. Ordering was tried first and is
    # NOT enough: Masonite's Route.routes is a class-level list, and on a
    # re-boot (every app TestCase) the registration order is not preserved --
    # "/gears/review/issue/approve" resolved to approve(id="issue") on the
    # second boot and 404'd on News.where("id", "issue"). Verified through the
    # real router in tests/unit/test_review_workflow.py.
    Route.get("/gears/review/issue/@id:int/preview", "gears.ReviewController@preview_issue").name("review.issue.preview").middleware("auth", "admin"),
    Route.post("/gears/review/issue/@id:int/approve", "gears.ReviewController@approve_issue").name("review.issue.approve").middleware("auth", "admin"),
    Route.post("/gears/review/issue/@id:int/reject", "gears.ReviewController@reject_issue").name("review.issue.reject").middleware("auth", "admin"),
    Route.get("/gears/review/@id:int/preview", "gears.ReviewController@preview").name("review.preview").middleware("auth", "admin"),
    Route.post("/gears/review/@id:int/approve", "gears.ReviewController@approve").name("review.approve").middleware("auth", "admin"),
    Route.post("/gears/review/@id:int/reject", "gears.ReviewController@reject").name("review.reject").middleware("auth", "admin"),
    # Self-service profile. "auth" only and always scoped to request.user() —
    # there is deliberately no /profile/@id, so no account can edit another.
    Route.post("/gears/profile", "gears.ProfileController@update").name("profile.update").middleware("auth"),
    Route.post("/gears/profile/avatar", "gears.ProfileController@upload_avatar").name("profile.avatar").middleware("auth"),
    Route.post("/gears/profile/avatar/remove", "gears.ProfileController@remove_avatar").name("profile.avatar.remove").middleware("auth"),
    # Its own throttle bucket: the middleware keys on limit_string + ip, so
    # sharing `password-reset` would let a change attempt spend a stranger's
    # reset allowance on a campus NAT — the same collision `otp` was split for.
    Route.post("/gears/profile/password", "gears.ProfileController@change_password")
    .name("profile.password")
    .middleware("auth", "throttle:password-change"),
    # The bell. "auth" only — every account has its own notifications, and each
    # endpoint scopes its query to the signed-in user rather than to the role.
    Route.get("/gears/notifications", "gears.NotificationController@index").name("notifications.index").middleware("auth"),
    Route.post("/gears/notifications/read-all", "gears.NotificationController@read_all").name("notifications.read_all").middleware("auth"),
    # Declared after "read-all" so the literal segment is matched before this
    # wildcard would swallow it.
    Route.post("/gears/notifications/@id/read", "gears.NotificationController@read").name("notifications.read").middleware("auth"),
    Route.post("/news/dashboard", "gears.NewsController@store").name("news.store").middleware("auth"),
    Route.post("/news/dashboard/layout", "gears.NewsController@layout").name("news.layout").middleware("auth"),
    Route.post("/news/dashboard/@id/body", "gears.NewsController@body").name("news.body").middleware("auth"),
    # The composer's debounced draft save. Separate from news.store on purpose:
    # it writes text only, never `status`, and refuses outright on a story that
    # is already public -- see NewsController.autosave for why it declines
    # rather than re-gating like news.body does.
    Route.post("/news/dashboard/@id/autosave", "gears.NewsController@autosave").name("news.autosave").middleware("auth"),
    Route.post("/news/dashboard/@id/unassign", "gears.NewsController@unassign").name("news.unassign").middleware("auth"),
    Route.delete("/news/dashboard/@id", "gears.NewsController@destroy").name("news.destroy").middleware("auth"),
    # News categories. "auth" only, DELIBERATELY: unlike the /gears/review/*
    # routes above, any signed-in editor may create, rename and delete a
    # category — and a delete cascades a soft-delete to every story in it,
    # published ones included, pulling them off the campus kiosk. That was a
    # product decision, not an oversight. The guard is the confirmation
    # dialog's story count, not a role, and both halves are recoverable
    # through news.categories.restore. Check before adding "admin" here.
    Route.get("/gears/news/categories", "gears.NewsCategoryController@index").name("news.categories.index").middleware("auth"),
    Route.post("/gears/news/categories", "gears.NewsCategoryController@store").name("news.categories.store").middleware("auth"),
    # Declared before the bare @id route below, so the literal "restore"
    # segment is matched before the wildcard would swallow it — same reason
    # the notifications block above orders "read-all" first.
    Route.post("/gears/news/categories/@id/restore", "gears.NewsCategoryController@restore").name("news.categories.restore").middleware("auth"),
    Route.post("/gears/news/categories/@id", "gears.NewsCategoryController@update").name("news.categories.update").middleware("auth"),
    Route.delete("/gears/news/categories/@id", "gears.NewsCategoryController@destroy").name("news.categories.destroy").middleware("auth"),
    Route.get("/org-board/dashboard", "gears.OrgBoardController@show").name("org-board.show").middleware("auth"),
    Route.post("/org-board/dashboard", "gears.OrgBoardController@store").name("org-board.store").middleware("auth"),
    Route.get("/org-board/dashboard/data", "gears.OrgBoardController@data").name("org-board.data").middleware("auth"),
    Route.post("/org-board/dashboard/move", "gears.OrgBoardController@move").name("org-board.move").middleware("auth"),
    Route.post("/org-board/dashboard/update", "gears.OrgBoardController@update").name("org-board.update").middleware("auth"),
    Route.post("/org-board/dashboard/photo", "gears.OrgBoardController@photo").name("org-board.photo").middleware("auth"),
    Route.post("/org-board/dashboard/delete", "gears.OrgBoardController@destroy").name("org-board.destroy").middleware("auth"),
    Route.post("/org-board/dashboard/reset-layout", "gears.OrgBoardController@reset_layout").name("org-board.reset-layout").middleware("auth"),
    Route.post("/org-board/dashboard/organization", "gears.OrgBoardController@store_organization").name("org-board.organization.store").middleware("auth"),
    Route.post("/org-board/dashboard/organization/update", "gears.OrgBoardController@update_organization").name("org-board.organization.update").middleware("auth"),
    Route.post("/org-board/dashboard/organization/delete", "gears.OrgBoardController@destroy_organization").name("org-board.organization.destroy").middleware("auth"),
    Route.post("/tour-scenes/dashboard", "kiosk.TourController@store").name("tour-scenes.store").middleware("auth"),
    Route.get("/gears/about-lspu", "kiosk.AboutController@editor").name("gears.about-lspu").middleware("auth"),
    Route.post("/gears/about-lspu/sections/@slug", "kiosk.AboutController@save_section").middleware("auth"),
    Route.post("/gears/about-lspu/milestones", "kiosk.AboutController@create_milestone").middleware("auth"),
    Route.post("/gears/about-lspu/milestones/@id", "kiosk.AboutController@update_milestone").middleware("auth"),
    Route.post("/gears/about-lspu/milestones/@id/delete", "kiosk.AboutController@delete_milestone").middleware("auth"),
    Route.post("/gears/about-lspu/milestones/@id/reorder", "kiosk.AboutController@reorder_milestone").middleware("auth"),
    Route.post("/gears/about-lspu/seal/upload", "kiosk.AboutController@upload_seal").middleware("auth"),
    Route.post("/gears/about-lspu/hymn/audio", "kiosk.AboutController@upload_hymn_audio").middleware("auth"),
    Route.post("/gears/about-lspu/hymn/video", "kiosk.AboutController@upload_hymn_video").middleware("auth"),
    Route.post("/gears/branding/logo", "gears.BrandingController@upload").name("branding.logo.upload").middleware("auth"),
    Route.post("/gears/branding/logo/restore", "gears.BrandingController@restore").name("branding.logo.restore").middleware("auth"),
]
