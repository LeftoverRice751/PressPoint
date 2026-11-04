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


class _FakeResponse:
    """Just enough of Masonite's Response for AjaxResponses to write into."""

    def __init__(self):
        self.body = None
        self.status = None

    def json(self, body, status=200):
        self.body = body
        self.status = status
        return self


class _SavableMember(_Member):
    """A member that records saves and deletes, so a move, an edit or a removal
    can be asserted on."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.saves = 0
        self.deleted = False

    def save(self):
        self.saves += 1

    def delete(self):
        self.deleted = True


class SiblingOrderTestCase(TestCase):
    """Order among siblings, the one thing an editor arranges by hand.

    The dashboard used to be a free-placement canvas whose positions the kiosk
    had stopped reading, and sort_order could not be set at all -- a member
    simply sat where they were added. The editor now draws the kiosk's own
    layout and orders a group with "Move earlier / later".
    """

    def _controller(self, members):
        from app.controllers.gears.OrgBoardController import OrgBoardController

        controller = OrgBoardController()
        controller._all_members = lambda: members
        controller._organization_payload = lambda organization_id: {
            "organization_id": organization_id,
            "members": [],
        }
        return controller

    def _board(self):
        """A chair with three officers, plus a lone root in another organization."""
        return [
            _SavableMember(1, 10, "Chair"),
            _SavableMember(2, 10, "Ada", parent_id=1, sort_order=1),
            _SavableMember(3, 10, "Grace", parent_id=1, sort_order=2),
            _SavableMember(4, 10, "Hedy", parent_id=1, sort_order=3),
            _SavableMember(5, 20, "Alan", sort_order=1),
        ]

    def _order(self, members, parent_id=1):
        rows = [row for row in members if row.parent_id == parent_id and row.organization_id == 10]
        return [row.name for row in sorted(rows, key=lambda row: row.sort_order)]

    def test_moving_earlier_swaps_with_the_sibling_before(self):
        members = self._board()
        response = _FakeResponse()

        self._controller(members).reorder(_FakeRequest(member_id=3, direction="earlier"), response)

        self.assertTrue(response.body["ok"], response.body)
        self.assertEqual(self._order(members), ["Grace", "Ada", "Hedy"])

    def test_moving_later_swaps_with_the_sibling_after(self):
        members = self._board()
        response = _FakeResponse()

        self._controller(members).reorder(_FakeRequest(member_id=3, direction="later"), response)

        self.assertTrue(response.body["ok"], response.body)
        self.assertEqual(self._order(members), ["Ada", "Hedy", "Grace"])

    def test_only_the_members_own_group_is_touched(self):
        members = self._board()

        self._controller(members).reorder(_FakeRequest(member_id=3, direction="earlier"), _FakeResponse())

        self.assertEqual(members[0].saves, 0, "the chair is not in the officers' group")
        self.assertEqual(members[4].saves, 0, "another organization is never renumbered")
        self.assertEqual(members[3].saves, 0, "Hedy kept her place, so her row is not rewritten")

    def test_the_first_cannot_move_earlier_nor_the_last_later(self):
        for member_id, direction in [(2, "earlier"), (4, "later")]:
            members = self._board()
            response = _FakeResponse()

            self._controller(members).reorder(
                _FakeRequest(member_id=member_id, direction=direction), response
            )

            self.assertFalse(response.body["ok"], f"{member_id} {direction} should be refused")
            self.assertEqual(self._order(members), ["Ada", "Grace", "Hedy"])
            self.assertTrue(all(row.saves == 0 for row in members), "a refusal writes nothing")

    def test_duplicate_sort_orders_are_healed_rather_than_swapped_in_place(self):
        """Older rows are all sort_order 0. Trading two zeros would change
        nothing and the button would look dead; renumbering the group fixes it."""
        members = [
            _SavableMember(1, 10, "Chair"),
            _SavableMember(2, 10, "Ada", parent_id=1),
            _SavableMember(3, 10, "Grace", parent_id=1),
        ]

        self._controller(members).reorder(_FakeRequest(member_id=3, direction="earlier"), _FakeResponse())

        self.assertEqual((members[2].sort_order, members[1].sort_order), (1, 2))

    def test_an_unknown_member_or_direction_is_refused(self):
        for inputs in [
            {"member_id": 999, "direction": "earlier"},
            {"member_id": None, "direction": "earlier"},
            {"member_id": 3, "direction": "sideways"},
            {"member_id": 3},
        ]:
            response = _FakeResponse()
            self._controller(self._board()).reorder(_FakeRequest(**inputs), response)
            self.assertFalse(response.body["ok"], f"{inputs!r} should be refused")

    def test_a_new_supervisor_puts_the_member_last_and_closes_the_gap_they_left(self):
        """update() is now the only way to change a supervisor. It used to keep
        the member's old sort_order in the new group and renumber the wrong one."""
        from unittest.mock import patch
        from app.controllers.gears import OrgBoardController as module

        members = self._board() + [
            _SavableMember(6, 10, "Vice", parent_id=1, sort_order=4),
            _SavableMember(7, 10, "Mary", parent_id=6, sort_order=1),
        ]
        by_id = {row.id: row for row in members}
        response = _FakeResponse()

        with patch.object(module, "Member") as member_model:
            member_model.find.side_effect = by_id.get
            self._controller(members).update(
                _FakeRequest(member_id=2, name="Ada", position="Officer", parent_id=6),
                None,
                response,
            )

        self.assertTrue(response.body["ok"], response.body)
        self.assertEqual(by_id[2].parent_id, 6)
        self.assertEqual(self._order(members, parent_id=6), ["Mary", "Ada"])
        self.assertEqual(
            [(row.name, row.sort_order) for row in sorted(
                (row for row in members if row.parent_id == 1), key=lambda row: row.sort_order
            )],
            [("Grace", 1), ("Hedy", 2), ("Vice", 3)],
        )


class _FakeRequest:
    """Just enough of Masonite's Request for these handlers to read inputs."""

    def __init__(self, **inputs):
        self._inputs = inputs

    def input(self, name, default=None):
        return self._inputs.get(name, default)


class EditAndDeleteReportTruthfullyTestCase(TestCase):
    """Editing or deleting a member must not report failure after succeeding.

    `_reorder_siblings_by_position` was deleted in bbf4967 — on a free canvas an
    x coordinate carries no ordering meaning, which is what the comment in
    `move()` now says — but two call sites in `update()` and `destroy()` were
    left behind. Both sit AFTER the row has already been written, inside a
    `try` whose `except Exception` swallows the resulting AttributeError and
    returns "Please try again". The edit lands and the editor is told it did
    not, which is the retry-and-duplicate trap fixed for uploads in c310775.
    """

    def _controller(self, members, monkeypatched_member=None):
        from app.controllers.gears import OrgBoardController as module

        controller = module.OrgBoardController()
        controller._all_members = lambda: members
        controller._organization_payload = lambda organization_id: {
            "organization_id": organization_id,
            "members": [],
        }
        return controller

    def test_updating_a_member_reports_success(self):
        from unittest.mock import patch
        from app.controllers.gears import OrgBoardController as module

        member = _SavableMember(1, 22, "Old Name", position="Old Position")
        response = _FakeResponse()
        controller = self._controller([member])

        with patch.object(module, "Member") as member_model:
            member_model.find.return_value = member
            controller.update(
                _FakeRequest(member_id=1, name="New Name", position="Chair"),
                None,
                response,
            )

        # At least once for the edit itself; _renumber_group may write the row
        # again as part of its sibling group, which is existing behaviour.
        self.assertGreaterEqual(member.saves, 1, "the row should have been written")
        self.assertTrue(
            response.body["ok"],
            f"update reported failure after saving: {response.body}",
        )
        self.assertIn("Member updated.", response.body["messages"])

    def test_deleting_a_member_reports_success_and_promotes_reports(self):
        from unittest.mock import patch
        from app.controllers.gears import OrgBoardController as module

        parent = _SavableMember(1, 22, "Chair")
        child = _SavableMember(2, 22, "Officer", parent_id=1)
        grandchild = _SavableMember(3, 22, "Assistant", parent_id=2)
        response = _FakeResponse()
        controller = self._controller([parent, child, grandchild])

        with patch.object(module, "Member") as member_model:
            member_model.find.return_value = child
            controller.destroy(_FakeRequest(member_id=2), response)

        self.assertTrue(child.deleted, "the row should have been removed")
        self.assertEqual(grandchild.parent_id, 1, "reports should be promoted")
        self.assertTrue(
            response.body["ok"],
            f"destroy reported failure after deleting: {response.body}",
        )
        self.assertEqual(response.body["promoted"], 1)
