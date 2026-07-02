"""Security Related Config"""

# Cross-Origin Resource Sharing
CORS = {
    "paths": ["api/*"],
    "allowed_methods": ["GET"],
    "allowed_origins": ["https://presspoint-gears.me"],
    "allowed_headers": ["Content-Type"],
    "exposed_headers": [],
    "max_age": None,
    "supports_credentials": False,
}
