"""Resized WebP derivatives for news images.

Why: uploads are stored at full camera resolution (multi-MB), but the kiosk
renders them at ~300-1200px. On a slow connection that is the dominant page
weight. We generate two right-sized WebP variants per image so the kiosk
downloads ~60-150 KB instead of several megabytes.

Portability: the *write* of each variant goes through the Masonite disk API
(`disk.put`) and existence checks through `disk.exists`, so when the `public`
disk is switched to the S3 config the derivatives follow with no change here.

The one thing the disk API can't do in this Masonite version is a *binary
read* — both LocalDriver.get() and AmazonS3Driver.get() decode to text, which
corrupts image bytes. So `generate_variants` takes the original bytes as an
argument rather than reading them itself:
  - at upload the bytes are already in memory (UploadedFile.get_content());
  - the one-time backfill script reads them from local disk and passes them in.
Neither path relies on disk.get().
"""

from io import BytesIO
import os

try:
    from PIL import Image, ImageOps
except ImportError:  # Pillow missing -> derivatives simply never generate
    Image = None
    ImageOps = None


# (filename suffix, max edge in px). thumbnail() preserves aspect and never
# upscales, so a small original just yields small variants.
VARIANTS = (
    ("large", 1400),
    ("thumb", 800),
)

_WEBP_QUALITY = 80
_WEBP_METHOD = 6
_RASTER_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff"}


def variant_relpath(stored_path, variant):
    """news/ab12.jpg + 'large' -> news/ab12.large.webp. Pure string op."""
    root, _ext = os.path.splitext(str(stored_path or "").replace("\\", "/"))
    return f"{root}.{variant}.webp"


def variant_path(stored_path, variant, disk):
    """Relative path of the derivative if it exists on the disk, else the
    original path. Lets templates point at the fast file while degrading to
    the original if a derivative is missing (upload failure, pre-backfill)."""
    if not stored_path:
        return stored_path
    candidate = variant_relpath(stored_path, variant)
    try:
        if disk.exists(candidate):
            return candidate
    except Exception:
        pass
    return str(stored_path).replace("\\", "/")


def news_image(story, variant):
    """Jinja filter: `{{ story | news_image('large') }}` -> the relative path
    of the best available image for a story, ready to prefix with /storage/.

    Works for both surfaces that share kiosk/_issue.html:
      - the kiosk dict already carries precomputed image_large/image_thumb
        (resolved behind the news cache) -> used directly, no filesystem hit;
      - the dashboard renders the News model -> resolve against the disk now.
    """
    if story is None:
        return ""

    key = "image_" + variant
    if isinstance(story, dict):
        precomputed = story.get(key)
        original = story.get("image")
    else:
        precomputed = getattr(story, key, None)
        original = getattr(story, "image", None)

    if precomputed:
        return str(precomputed).replace("\\", "/")
    if not original:
        return ""

    try:
        from masonite.facades import Storage
        disk = Storage.disk("public")
    except Exception:
        disk = None
    return variant_path(original, variant, disk)


def generate_variants(original_bytes, stored_path, disk):
    """Write the WebP variants for one image. Never raises: a failure here
    must not block publishing — serving falls back to the original.

    original_bytes: the raw uploaded/on-disk image bytes.
    stored_path:    the original's stored relative path, e.g. "news/ab12.jpg".
    disk:           a Masonite storage disk (e.g. storage.disk("public")).
    """
    if Image is None or not original_bytes or not stored_path:
        return

    ext = os.path.splitext(str(stored_path))[1].lower()
    if ext not in _RASTER_EXTS:
        return

    try:
        with Image.open(BytesIO(original_bytes)) as img:
            # Animated GIFs would lose their animation as a single-frame WebP;
            # leave them to serve as the original.
            if getattr(img, "is_animated", False):
                return

            img = ImageOps.exif_transpose(img)  # honour phone-rotation EXIF
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if "A" in img.getbands() else "RGB")

            for suffix, max_edge in VARIANTS:
                target = variant_relpath(stored_path, suffix)
                try:
                    if disk.exists(target):
                        continue
                except Exception:
                    pass

                frame = img.copy()
                frame.thumbnail((max_edge, max_edge), Image.LANCZOS)

                buf = BytesIO()
                frame.save(buf, "WEBP", quality=_WEBP_QUALITY, method=_WEBP_METHOD)
                disk.put(target, buf.getvalue())
    except Exception:
        # Corrupt/unsupported image, disk error, etc. — degrade to original.
        return
