from masonite.environment import env
from masonite.utils.location import base_path


DISKS = {
    "default": "local",
    "local": {"driver": "local", "path": "storage/framework/views"},
    "public": {"driver": "local", "path": "storage/framework/public"},
    "s3": {
        "driver": "s3",
        "client": env("S3_CLIENT"),
        "secret": env("S3_SECRET"),
        "bucket": env("S3_BUCKET"),
    },
}

STATICFILES = {
    # folder          # template alias
    "storage/static": "static/",
    "storage/compiled": "assets/",
    "storage/public": "/",
}
