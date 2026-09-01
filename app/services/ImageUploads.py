"""Shared image-upload handling for editor surfaces.

Extracted from AboutController so the About seal/milestone uploads and the
branding logo upload share one validated write path. Validation is by magic
bytes, never by the filename the browser sent.
"""

import os
import secrets

from app.services.FileVerificationService import FileVerificationService
from app.services.StorageRouter import gearsnas_base


MAX_IMAGE_BYTES = 4 * 1024 * 1024


def read_upload(file):
    """Pull the raw bytes out of a Masonite upload object.

    Masonite exposes `stream` as a callable on some file objects and as a
    plain attribute on others, so both shapes are handled here.
    """
    if isinstance(file, list):
        file = file[0] if file else None
    if not file:
        return None

    content = getattr(file, "content", None)
    if content is None and hasattr(file, "stream") and callable(file.stream):
        s = file.stream()
        content = s.read() if hasattr(s, "read") else s
    elif content is None and hasattr(file, "stream"):
        content = file.stream.read()
    return content


# The extension a verified image is stored under. Derived from the magic-byte
# result rather than the filename: the two disagreeing was a stored-XSS hole.
# A file whose bytes are a valid PNG but whose name ended in .html was saved as
# .html, and nginx serves these NAS folders directly with Content-Type taken
# from the extension (no nosniff, no CSP) -- so it came back as text/html on the
# app's own origin and any script in it ran with the viewer's session.
EXTENSION_FOR_IMAGE_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def verified_image_extension(content):
    """The extension matching this buffer's actual type, or None if it is not
    an image type we accept."""
    return EXTENSION_FOR_IMAGE_MIME.get(FileVerificationService.get_buffer_type(content))


def upload_extension(file, default=""):
    """The extension in the browser-supplied filename.

    Attacker-controlled, so it must never decide how a file is stored. Kept for
    callers that only display or compare it -- use verified_image_extension()
    to name a file.
    """
    raw_filename = getattr(file, "filename", "") or ""
    ext = os.path.splitext(raw_filename)[1].lower() or default
    if hasattr(file, "extension") and callable(file.extension):
        ext = (file.extension() or ext).lower()
    if ext and not ext.startswith("."):
        ext = "." + ext
    if ext == ".jpeg":
        ext = ".jpg"
    return ext


def save_uploaded_image(file, nas_subdir, prefix):
    """Validate and persist an uploaded image to NAS. Returns (stored_path, error).

    stored_path uses the NAS-relative form (e.g. 'About/seal-abc.png') so that
    StorageRouter.absolute_path resolves it to the correct NAS mount.
    """
    if isinstance(file, list):
        file = file[0] if file else None
    if not file:
        return None, "Upload must be a JPEG, PNG, or WEBP image."

    content = read_upload(file)
    if content is None:
        return None, "Could not read uploaded file."

    # Verify by actual content (magic bytes), not just the extension.
    if not FileVerificationService.verify_buffer(content, "image"):
        return None, "Upload must be a JPEG, PNG, or WEBP image."

    if len(content) > MAX_IMAGE_BYTES:
        return None, "Image must be 4 MB or smaller."

    # Name the file after what it actually is, never after what it was called.
    extension = verified_image_extension(content)
    if not extension:
        return None, "Upload must be a JPEG, PNG, or WEBP image."

    filename = f"{prefix}-{secrets.token_hex(8)}{extension}"
    target_dir = os.path.join(gearsnas_base(), nas_subdir)

    # The NAS is a Samba share the editors also write to over SMB, so the
    # group bits have to survive the write.
    old_mask = os.umask(0o002)
    try:
        os.makedirs(target_dir, mode=0o775, exist_ok=True)
        target_path = os.path.join(target_dir, filename)
        with open(target_path, "wb") as fh:
            fh.write(content)
        os.chmod(target_path, 0o664)
    finally:
        os.umask(old_mask)

    stored_path = f"{nas_subdir}/{filename}"
    return stored_path, None
