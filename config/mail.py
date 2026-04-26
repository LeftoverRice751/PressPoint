from masonite.environment import env


FROM_EMAIL = env("MAIL_FROM_ADDRESS", env("MAIL_FROM", "no-reply@masonite.com"))
MAIL_PASSWORD = (env("MAIL_PASSWORD", "") or "").replace(" ", "")

DRIVERS = {
    "default": env("MAIL_DRIVER", "terminal"),
    "smtp": {
        "host": env("MAIL_HOST"),
        "port": env("MAIL_PORT"),
        "username": (env("MAIL_USERNAME", "") or "").strip(),
        "password": MAIL_PASSWORD,
        "tls": env("MAIL_TLS", env("MAIL_TSL", True)),
        "from": FROM_EMAIL,
    },
    "mailgun": {
        "domain": env("MAILGUN_DOMAIN"),
        "secret": env("MAILGUN_SECRET"),
        "region": env("MAILGUN_REGION"),
        "from": FROM_EMAIL,
    },
    "terminal": {
        "from": FROM_EMAIL,
    },
}
