from masonite.environment import env


DRIVERS = {
    "slack": {
        "token": env("SLACK_TOKEN", ""),  # used for API mode
        "webhook": env("SLACK_WEBHOOK", ""),  # used for webhook mode
    },
    "vonage": {
        "key": env("VONAGE_KEY", ""),
        "secret": env("VONAGE_SECRET", ""),
        "sms_from": env("VONAGE_SMS_FROM", "+33000000000"),
    },
    "database": {
        # Unused -- app/services/Notifications.py writes the table directly --
        # but it named a sqlite connection that no longer exists (W12).
        "connection": "mysql",
        "table": "notifications",
    },
}

DRY = False
