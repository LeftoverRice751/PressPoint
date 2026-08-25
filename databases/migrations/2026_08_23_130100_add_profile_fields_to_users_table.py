"""AddProfileFieldsToUsersTable Migration."""

from masoniteorm.migrations import Migration


class AddProfileFieldsToUsersTable(Migration):
    def up(self):
        """Run the migrations.

        `users` has only ever held credentials — email, username, password,
        role. There was no human name anywhere, so every surface that wanted to
        show "who is this" fell back to the login username, and the new profile
        menu and review queue both need a real display name.

        Both nullable, no backfill: an account with no `full_name` renders its
        `username` instead (see `avatar_url()` / the profile border in
        templates/gears/dashboard.html), which is exactly today's behaviour.

        `avatar_path` stores a NAS-relative path like "Profiles/avatar-a1b2c3d4.png"
        — the same shape `Branding` stores its logo as, resolved through
        StorageRouter. NULL means "render initials", and so does a path whose
        file has gone missing, so an unmounted NAS degrades to initials rather
        than a broken image.

        Note for whoever adds to this table next: `User.__fillable__` includes
        `role`. Anything that mass-assigns request input into a User is
        privilege escalation. The profile controller assigns attributes one by
        one on purpose.
        """
        with self.schema.table("users") as table:
            table.string("full_name").nullable()
            table.string("avatar_path").nullable()

    def down(self):
        """Revert the migrations."""
        with self.schema.table("users") as table:
            table.drop_column("full_name")
            table.drop_column("avatar_path")
