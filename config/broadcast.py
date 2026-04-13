from masonite.environment import env


BROADCASTS = {
    "default": "pusher",
    "pusher": {
        "driver": "pusher",
        "client": env("PUSHER_KEY", env("PUSHER_CLIENT", cast=False), cast=False),
        "key": env("PUSHER_KEY", env("PUSHER_CLIENT", cast=False), cast=False),
        "app_id": env("PUSHER_APP_ID"),
        "secret": env("PUSHER_SECRET"),
        "cluster": env("PUSHER_CLUSTER"),
        "host": env("PUSHER_HOST", None),
        "port": env("PUSHER_PORT", None, cast=False),
        "ssl": False,
    },
}
