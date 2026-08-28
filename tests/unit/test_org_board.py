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
    """A member that records saves, so a batch move can be asserted on."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.saves = 0

    def save(self):
        self.saves += 1


class CanvasPositionTestCase(TestCase):
    """Free-form placement on the org board canvas.

    The canvas anchors at a fixed origin (0, 0): an origin derived from the
    content's own bounding box shifts every card the moment a drag creates a
    new leftmost one, so a dropped card did not stay where it was released.
    Nothing may therefore persist a negative coordinate.
    """

    def _controller_with_members(self, members):
        from app.controllers.gears.OrgBoardController import OrgBoardController

        controller = OrgBoardController()
        controller._all_members = lambda: members
        controller._organization_payload = lambda organization_id: {
            "organization_id": organization_id,
            "members": [],
        }
        return controller

    def test_clamp_position_folds_negatives_back_to_the_origin(self):
        from app.controllers.gears.OrgBoardController import _clamp_position

        self.assertEqual(_clamp_position(-1), 0)
        self.assertEqual(_clamp_position(-4000), 0)
        self.assertEqual(_clamp_position(0), 0)
        self.assertEqual(_clamp_position(275), 275)

    def test_clamp_position_leaves_a_missing_coordinate_alone(self):
        """None means "no coordinate sent", which is not the same as zero."""
        from app.controllers.gears.OrgBoardController import _clamp_position

        self.assertIsNone(_clamp_position(None))

    def test_a_batch_move_saves_every_card_it_is_given(self):
        members = [
            _SavableMember(id=1, organization_id=10, name="Ada"),
            _SavableMember(id=2, organization_id=10, name="Grace"),
        ]
        controller = self._controller_with_members(members)
        response = _FakeResponse()

        controller._move_positions(
            response,
            '[{"member_id": 1, "pos_x": 28, "pos_y": 56},'
            ' {"member_id": 2, "pos_x": 84, "pos_y": 56}]',
        )

        self.assertTrue(response.body["ok"])
        self.assertEqual((members[0].pos_x, members[0].pos_y), (28, 56))
        self.assertEqual((members[1].pos_x, members[1].pos_y), (84, 56))

    def test_a_batch_move_clamps_coordinates_to_the_origin(self):
        members = [_SavableMember(id=1, organization_id=10, name="Ada")]
        controller = self._controller_with_members(members)

        controller._move_positions(
            _FakeResponse(), '[{"member_id": 1, "pos_x": -60, "pos_y": -12}]'
        )

        self.assertEqual((members[0].pos_x, members[0].pos_y), (0, 0))

    def test_a_card_already_at_the_position_is_not_re_saved(self):
        """A subtree drag re-posts every descendant; unchanged rows must not write."""
        members = [
            _SavableMember(id=1, organization_id=10, name="Ada", pos_x=28, pos_y=56),
            _SavableMember(id=2, organization_id=10, name="Grace", pos_x=0, pos_y=0),
        ]
        controller = self._controller_with_members(members)

        controller._move_positions(
            _FakeResponse(),
            '[{"member_id": 1, "pos_x": 28, "pos_y": 56},'
            ' {"member_id": 2, "pos_x": 84, "pos_y": 56}]',
        )

        self.assertEqual(members[0].saves, 0)
        self.assertEqual(members[1].saves, 1)

    def test_a_batch_may_not_straddle_organizations(self):
        members = [
            _SavableMember(id=1, organization_id=10, name="Ada"),
            _SavableMember(id=2, organization_id=20, name="Alan"),
        ]
        controller = self._controller_with_members(members)
        response = _FakeResponse()

        controller._move_positions(
            response,
            '[{"member_id": 1, "pos_x": 0, "pos_y": 0},'
            ' {"member_id": 2, "pos_x": 28, "pos_y": 0}]',
        )

        self.assertFalse(response.body["ok"])
        self.assertEqual(members[0].saves, 0)
        self.assertEqual(members[1].saves, 0)

    def test_a_batch_naming_an_unknown_member_is_refused_whole(self):
        members = [_SavableMember(id=1, organization_id=10, name="Ada")]
        controller = self._controller_with_members(members)
        response = _FakeResponse()

        controller._move_positions(
            response,
            '[{"member_id": 1, "pos_x": 28, "pos_y": 0},'
            ' {"member_id": 999, "pos_x": 28, "pos_y": 0}]',
        )

        self.assertFalse(response.body["ok"])
        self.assertEqual(members[0].saves, 0, "nothing is written until the batch validates")

    def test_malformed_position_payloads_are_rejected(self):
        controller = self._controller_with_members([])

        for payload in ["", "not json", "{}", "[]", '[{"member_id": 1}]', '["nope"]']:
            response = _FakeResponse()
            controller._move_positions(response, payload)
            self.assertFalse(response.body["ok"], f"{payload!r} should be refused")
