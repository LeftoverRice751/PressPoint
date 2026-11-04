from magic import Magic


class FileVerificationService:
    ALLOWED_TYPES = {
        "pdf": ["application/pdf"],
        "image": ["image/jpeg", "image/png", "image/webp"],
        # News and org-board photos have always accepted GIFs. "image" does not.
        "photo": ["image/jpeg", "image/png", "image/webp", "image/gif"],
        "audio": [
            "audio/mpeg",
            "audio/ogg",
            "application/ogg",
            "audio/wav",
            "audio/x-wav",
            "audio/vnd.wave",
            "audio/mp4",
            "audio/x-m4a",
            "video/mp4",
        ],
        "csv": ["text/csv", "text/plain"],
        # Only the containers a kiosk browser actually decodes. "video" had an
        # extension set but no MIME list, so verify_buffer(content, "video")
        # checked against an empty allowlist and rejected every real video --
        # which is why callers gated on the filename extension alone instead.
        # libmagic reports .m4v as video/x-m4v, not video/mp4.
        "video": ["video/mp4", "video/webm", "video/x-m4v"],
        # The kiosk-video manager also takes .mov and .ogg, which "video" refuses.
        "managed-video": [
            "video/mp4",
            "video/webm",
            "video/x-m4v",
            "video/quicktime",
            "video/ogg",
            "application/ogg",
        ],
    }

    ALLOWED_EXTENSIONS = {
        "video": {".mp4", ".mov", ".webm", ".m4v", ".ogg"},
        "audio": {".mp3", ".ogg", ".wav", ".m4a"},
        "image": {".jpg", ".jpeg", ".png", ".webp"},
        "pdf": {".pdf"},
    }

    @staticmethod
    def verify_file_type(file_path, expected_type):
        mime = Magic(mime=True)
        actual_type = mime.from_file(file_path)

        allowed = FileVerificationService.ALLOWED_TYPES.get(expected_type, [])
        return actual_type in allowed

    @staticmethod
    def verify_buffer(content, expected_type):
        mime = Magic(mime=True)
        actual_type = mime.from_buffer(content)

        allowed = FileVerificationService.ALLOWED_TYPES.get(expected_type, [])
        return actual_type in allowed

    @staticmethod
    def verify_audio(content):
        """Audio by content. An ID3-tagged MP3 can defeat libmagic, which then says
        application/octet-stream and not audio/mpeg, so the tag counts for that one
        answer. A page or script still reports text/html or text/plain."""
        actual_type = Magic(mime=True).from_buffer(content)
        if actual_type in FileVerificationService.ALLOWED_TYPES["audio"]:
            return True
        return actual_type == "application/octet-stream" and content[:3] == b"ID3"

    @staticmethod
    def verify_extension(extension, expected_type):
        ext = (extension or "").strip().lower()
        if ext and not ext.startswith("."):
            ext = "." + ext

        allowed = FileVerificationService.ALLOWED_EXTENSIONS.get(expected_type, set())
        return ext in allowed

    @staticmethod
    def get_file_type(file_path):
        mime = Magic(mime=True)
        return mime.from_file(file_path)

    @staticmethod
    def get_buffer_type(content):
        """The MIME type of an in-memory upload, by magic bytes.

        The buffer counterpart of get_file_type. Callers that name a stored file
        need this: an extension taken from the browser-supplied filename is
        attacker-controlled, and nginx serves these folders with Content-Type
        derived from the extension.
        """
        mime = Magic(mime=True)
        return mime.from_buffer(content)
