from magic import Magic


class FileVerificationService:
    ALLOWED_TYPES = {
        "pdf": ["application/pdf"],
        "image": ["image/jpeg", "image/png", "image/webp"],
        "csv": ["text/csv", "text/plain"]
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
