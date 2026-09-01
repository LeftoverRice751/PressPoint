from app.models.User import User

GUARDS = {
    "default": "web",
    "web": {"model": User},
    "password_reset_table": "password_resets",
    # In minutes. None if disabled. Was 1440 (24h), which kept a large pool of
    # live 6-digit codes valid at once -- the bigger that pool, the better the
    # odds of a blind guess landing on some account. A reset takes a minute.
    "password_reset_expiration": 15,
}
