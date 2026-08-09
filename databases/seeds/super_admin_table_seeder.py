"""SuperAdminTableSeeder Seeder.

Creates the super admin account the /auth/super_admin dashboard requires.
No migration or other seeder produces one, so a fresh install has no way to
reach that page — SuperAdminMiddleware bounces every other role.

Run it on its own (databases/seeds/database_seeder.py is not wired to it):

    python craft seed:run super_admin

Credentials come from the environment. Set them for a real deployment:

    SUPER_ADMIN_USERNAME=…   (default: superadmin)
    SUPER_ADMIN_EMAIL=…      (default: superadmin@presspoint.local)
    SUPER_ADMIN_PASSWORD=…   (default: a fresh random one, printed once)
"""

import os
import secrets

from masoniteorm.seeds import Seeder
from masonite.facades import Hash

from app.models.User import User


DEFAULT_USERNAME = "superadmin"
DEFAULT_EMAIL = "superadmin@presspoint.local"
SUPER_ADMIN_ROLE = "superadmin"


def resolve_credentials(env=None):
    """Read the account's credentials from the environment.

    The password is deliberately never defaulted to a literal: with no
    SUPER_ADMIN_PASSWORD set, a fresh random one is generated and printed
    once, so a seeded deployment cannot end up with a password that is
    sitting in the repository.

    Returns (username, email, password, was_generated).
    """
    env = os.environ if env is None else env

    username = (env.get("SUPER_ADMIN_USERNAME") or DEFAULT_USERNAME).strip()
    email = (env.get("SUPER_ADMIN_EMAIL") or DEFAULT_EMAIL).strip().lower()
    password = (env.get("SUPER_ADMIN_PASSWORD") or "").strip()

    was_generated = not password
    if was_generated:
        password = secrets.token_urlsafe(16)

    return username, email, password, was_generated


def find_existing(users, username, email):
    """The user this seeder would collide with, if any.

    Matches on either field: `username` is the auth column (User.__auth__),
    and the dashboard's create form rejects duplicate emails, so re-seeding
    on top of either one would produce an account that cannot be used.
    """
    for user in users or []:
        existing_username = (getattr(user, "username", "") or "").strip().lower()
        existing_email = (getattr(user, "email", "") or "").strip().lower()
        if existing_username == username.lower() or existing_email == email:
            return user
    return None


class SuperAdminTableSeeder(Seeder):
    def run(self):
        """Run the database seeds."""
        username, email, password, was_generated = resolve_credentials()

        existing = find_existing(User.all(), username, email)
        if existing:
            # Re-running the seeder must not mint a duplicate login or quietly
            # reset a live account's password.
            print(
                f"Super admin seeder skipped: '{existing.username}' "
                f"({existing.email}) already exists with role "
                f"'{existing.role}'. Delete it first, or set "
                f"SUPER_ADMIN_USERNAME / SUPER_ADMIN_EMAIL to seed a different account."
            )
            return

        User.create(
            {
                "username": username,
                "email": email,
                "password": Hash.make(password),
                "role": SUPER_ADMIN_ROLE,
            }
        )

        print(f"Super admin created: {username} <{email}>")
        if was_generated:
            print(f"Generated password (shown once, store it now): {password}")
        else:
            print("Password taken from SUPER_ADMIN_PASSWORD.")
