"""Org board tree and organization rules.

The org board had no tests at all while it was built on the location-derived
`departments` table. These cover the invariants that survived the move to
editor-owned organizations: members group by `organization_id`, a chart never
nests across organizations, and an organization with members cannot be deleted
out from under them.
"""

from app.models.Organization import Organization
from app.services.OrgBoardTree import (
    build_member_tree,
    build_org_board_organizations,
    member_node,
    organization_sort_key,
)
from tests import TestCase


class _Member:
    """Stand-in for a members row — the tree only reads these attributes."""

    def __init__(self, id, organization_id, name, parent_id=None, sort_order=0,
                 position="Member", photo_path=None, pos_x=None, pos_y=None):
        self.id = id
        self.organization_id = organization_id
        self.name = name
        self.parent_id = parent_id
        self.sort_order = sort_order
        self.position = position
        self.photo_path = photo_path
        self.pos_x = pos_x
        self.pos_y = pos_y


class _Organization:
    def __init__(self, id, name, kind="department"):
        self.id = id
        self.name = name
        self.kind = kind


class OrgBoardTreeTestCase(TestCase):
    def test_member_node_carries_organization_id(self):
        # This key is the JSON contract templates/kiosk/org-board.html and
        # resources/js/org-board-editor.js both read.
        node = member_node(_Member(id=1, organization_id=7, name="Ada"))

        self.assertEqual(node["organization_id"], 7)
        self.assertNotIn("department_id", node)

    def test_members_group_by_organization(self):
        members = [
            _Member(id=1, organization_id=10, name="Ada", sort_order=1),
            _Member(id=2, organization_id=20, name="Grace", sort_order=1),
        ]

        roots = build_member_tree(members)

        self.assertEqual(sorted(roots.keys()), [10, 20])
        self.assertEqual([n["name"] for n in roots[10]], ["Ada"])
        self.assertEqual([n["name"] for n in roots[20]], ["Grace"])

    def test_children_nest_under_their_parent(self):
        members = [
            _Member(id=1, organization_id=10, name="Dean", sort_order=1),
            _Member(id=2, organization_id=10, name="Chair", parent_id=1, sort_order=1),
        ]

        roots = build_member_tree(members)

        self.assertEqual(len(roots[10]), 1)
        self.assertEqual([c["name"] for c in roots[10][0]["children"]], ["Chair"])

    def test_a_child_never_nests_across_organizations(self):
        # A member whose parent sits in another organization is promoted to a
        # root of its own rather than dragged onto the wrong chart.
        members = [
            _Member(id=1, organization_id=10, name="Dean", sort_order=1),
            _Member(id=2, organization_id=20, name="Stray", parent_id=1, sort_order=1),
        ]

        roots = build_member_tree(members)

        self.assertEqual(roots[10][0]["children"], [])
        self.assertEqual([n["name"] for n in roots[20]], ["Stray"])

    def test_build_rows_reports_kind_and_no_location(self):
        rows = build_org_board_organizations(
            [
                _Organization(id=10, name="CCS", kind="department"),
                _Organization(id=20, name="Supreme Student Council", kind="organization"),
            ],
            [_Member(id=1, organization_id=10, name="Ada", sort_order=1)],
        )

        self.assertEqual([row["name"] for row in rows], ["CCS", "Supreme Student Council"])
        self.assertEqual(rows[0]["kind_label"], "Department")
        self.assertEqual(rows[1]["kind_label"], "Organization")
        self.assertEqual([m["name"] for m in rows[0]["members"]], ["Ada"])
        self.assertEqual(rows[1]["members"], [])
        # The board no longer joins through locations.
        for row in rows:
            self.assertNotIn("location_name", row)
            self.assertNotIn("location_type", row)

    def test_unknown_kind_falls_back_to_department(self):
        rows = build_org_board_organizations([_Organization(1, "Odd", kind="club")], [])

        self.assertEqual(rows[0]["kind"], Organization.KIND_DEPARTMENT)
        self.assertEqual(rows[0]["kind_label"], "Department")

    def test_sort_puts_departments_first_then_alphabetical(self):
        rows = [
            _Organization(id=3, name="Zoology", kind="department"),
            _Organization(id=1, name="Alpha Society", kind="organization"),
            _Organization(id=2, name="Anthropology", kind="department"),
        ]

        ordered = [row.name for row in sorted(rows, key=organization_sort_key)]

        self.assertEqual(ordered, ["Anthropology", "Zoology", "Alpha Society"])


class OrganizationKindTestCase(TestCase):
    def test_normalize_kind_accepts_only_known_kinds(self):
        self.assertEqual(Organization.normalize_kind("Department"), "department")
        self.assertEqual(Organization.normalize_kind("  ORGANIZATION "), "organization")
        self.assertIsNone(Organization.normalize_kind("club"))
        self.assertIsNone(Organization.normalize_kind(None))

    def test_label_for_falls_back_rather_than_raising(self):
        self.assertEqual(Organization.label_for("organization"), "Organization")
        self.assertEqual(Organization.label_for("nonsense"), "Department")


class OrganizationDeleteGuardTestCase(TestCase):
    """The delete guard, exercised without a database.

    members.organization_id is ON DELETE CASCADE, so this count is the only
    thing standing between "remove an organization" and "silently destroy its
    whole org chart".
    """

    def _controller_with_members(self, members):
        from app.controllers.gears.OrgBoardController import OrgBoardController

        controller = OrgBoardController()
        controller._all_members = lambda: members
        return controller

    def test_counts_only_the_organizations_own_members(self):
        controller = self._controller_with_members([
            _Member(id=1, organization_id=10, name="Ada"),
            _Member(id=2, organization_id=10, name="Grace"),
            _Member(id=3, organization_id=20, name="Alan"),
        ])

        self.assertEqual(controller._organization_member_count(10), 2)
        self.assertEqual(controller._organization_member_count(20), 1)
        self.assertEqual(controller._organization_member_count(30), 0)
