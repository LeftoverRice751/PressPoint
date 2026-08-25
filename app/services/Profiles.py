"""Staff identity: display name, avatar, initials.

The `users` table only ever held credentials, so every surface that wanted to
show "who is this" fell back to the login username. These helpers are what the
profile menu, the review queue byline, and the Story Library's Author column all
read, so the answer is the same everywhere.
"""

import os

from app.services.StorageRouter import absolute_path, is_safe_path


#: Where avatars live on the GearsNAS volume. "Profiles" is registered in
#: StorageRouter.NAS_FOLDERS and mirrored in the nginx regex, so nginx serves
#: these directly and only falls back to Python on a miss.
AVATAR_SUBDIR = "Profiles"


def display_name(user):
    """What to call this account on screen.

    `full_name` is the name they chose; `username` is the login they were
    issued. Falling back keeps every surface working for accounts that predate
    the profile columns — which, right now, is all of them.
    """
    if not user:
        return ""
    return (getattr(user, "full_name", None) or getattr(user, "username", None) or "").strip()


def initials(user):
    """One or two letters for the fallback avatar.

    "Maria Santos" -> MS, "editor" -> E. Deliberately not three-plus: the
    circle is small, and more letters stop being legible before they start
    being more identifying.
    """
    name = display_name(user)
    if not name:
        return "?"

    parts = [part for part in name.replace(".", " ").split() if part]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][0].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def avatar_url(user):
    """Public URL for the account's avatar, or "" to render initials instead.

    Returns "" rather than a placeholder path when the file is missing, so an
    unmounted NAS degrades to initials rather than to a broken image — the same
    guard Branding._resolve_logo_url uses for the site logo.
    """
    stored_path = (getattr(user, "avatar_path", None) or "").strip() if user else ""
    if not stored_path:
        return ""

    # The value comes from the database, so it goes through the traversal guard
    # before it is turned into a filesystem path.
    if not is_safe_path(stored_path):
        return ""

    try:
        if not os.path.isfile(absolute_path(stored_path)):
            return ""
    except Exception:
        return ""

    return "/storage/" + stored_path


def delete_avatar_file(stored_path):
    """Remove a replaced avatar. Best-effort: a failure here orphans one small
    file, which is not worth failing the user's upload over."""
    stored_path = (stored_path or "").strip()
    if not stored_path or not is_safe_path(stored_path):
        return False

    try:
        path = absolute_path(stored_path)
        if os.path.isfile(path):
            os.remove(path)
            return True
    except Exception:
        pass
    return False
