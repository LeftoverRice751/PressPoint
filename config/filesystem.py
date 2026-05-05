from masonite.environment import env
from masonite.utils.location import base_path


# `gearsnas` is the hybrid-cloud volume mounted from the GearsNAS Samba
# share. The web app and editors (over SMB) read/write the same files,
# so any upload from the dashboard is immediately visible on the NAS
# and vice-versa. We use one disk rooted at the share, with subfolders
# per content type (Archives/, Videos/, Archives/covers/).
DISKS = {
    "default": "public",
    "local": {"driver": "file", "path": "storage/framework/views"},
    "public": {"driver": "file", "path": "storage/framework/public"},
    "gearsnas": {
        "driver": "file",
        "path": env("GEARSNAS_BASE", "/mnt/nas_storage/gears_data"),
    },
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
