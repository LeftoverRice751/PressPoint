"""Organization Model."""

from masoniteorm.models import Model
from masoniteorm.relationships import has_many


class Organization(Model):
    """A department or student organization that owns an org-board chart.

    This replaced the old `departments` table, which was a shadow of
    `locations`: it carried a UNIQUE `location_id` and rows were auto-created
    from every Department-type location on each dashboard render, so an editor
    could never add one by hand — a row without a matching location was
    filtered out of every view. Organizations are editor-owned records with no
    tie to the campus map; `members` is the only table that joins to them.

    `kind` separates an academic department from a student organization. It is
    a plain string rather than a DB enum so adding a third kind later is a code
    change, not a migration.
    """

    KIND_DEPARTMENT = "department"
    KIND_ORGANIZATION = "organization"

    #: The kinds an editor may choose, in the order the dropdown groups them.
    KINDS = (KIND_DEPARTMENT, KIND_ORGANIZATION)

    #: Human labels for the kiosk card eyebrow and the dashboard optgroups.
    KIND_LABELS = {
        KIND_DEPARTMENT: "Department",
        KIND_ORGANIZATION: "Organization",
    }

    __fillable__ = [
        "name",
        "kind",
    ]

    @has_many("id", "organization_id")
    def members(self):
        from app.models.Member import Member

        return Member

    @classmethod
    def normalize_kind(cls, raw_kind):
        """Return a valid kind, or None if the value isn't one we accept."""
        kind = (raw_kind or "").strip().lower()
        return kind if kind in cls.KINDS else None

    @classmethod
    def label_for(cls, raw_kind):
        """Display label for a kind, falling back to Department."""
        return cls.KIND_LABELS.get(
            cls.normalize_kind(raw_kind) or cls.KIND_DEPARTMENT,
            cls.KIND_LABELS[cls.KIND_DEPARTMENT],
        )
