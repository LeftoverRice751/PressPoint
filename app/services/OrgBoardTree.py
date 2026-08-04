"""Shared helpers for building the organizational board tree.

Both the dashboard editor and the public kiosk render the same hierarchy, so the
tree is assembled here once instead of inside a controller.
"""


def _field(row, name, default=None):
    """Read a field from either a model instance or a plain node dict."""
    if isinstance(row, dict):
        value = row.get(name, default)
    else:
        value = getattr(row, name, default)
    return default if value is None else value


def member_sort_key(row):
    return (
        int(_field(row, "sort_order", 0) or 0),
        str(_field(row, "name", "") or "").strip().lower(),
        int(_field(row, "id", 0) or 0),
    )


def member_node(member):
    """Serialize one member into the shape the templates and the JS expect."""
    pos_x = _field(member, "pos_x", None)
    pos_y = _field(member, "pos_y", None)

    return {
        "id": _field(member, "id", None),
        "name": _field(member, "name", "") or "",
        "position": _field(member, "position", "") or "",
        "photo_path": _field(member, "photo_path", "") or "",
        "department_id": _field(member, "department_id", None),
        "parent_id": _field(member, "parent_id", None),
        "sort_order": int(_field(member, "sort_order", 0) or 0),
        "pos_x": int(pos_x) if pos_x is not None and pos_x != "" else None,
        "pos_y": int(pos_y) if pos_y is not None and pos_y != "" else None,
        "children": [],
    }


def build_member_tree(members):
    """Return {department_id: [root nodes]} with children sorted in place."""
    node_lookup = {}
    roots_by_department = {}

    for member in members:
        node = member_node(member)
        node_lookup[node["id"]] = node

    for node in sorted(node_lookup.values(), key=member_sort_key):
        parent_node = node_lookup.get(node["parent_id"])
        if parent_node and parent_node["department_id"] == node["department_id"]:
            parent_node["children"].append(node)
        else:
            roots_by_department.setdefault(node["department_id"], []).append(node)

    def sort_branch(node):
        node["children"].sort(key=member_sort_key)
        for child in node["children"]:
            sort_branch(child)

    for roots in roots_by_department.values():
        roots.sort(key=member_sort_key)
        for root in roots:
            sort_branch(root)

    return roots_by_department


def build_org_board_departments(departments, locations, members):
    """Return one row per department, each carrying its own member tree."""
    location_lookup = {
        getattr(location, "id", None): location
        for location in locations
    }

    roots_by_department = build_member_tree(members)

    department_rows = []
    for department in departments:
        department_id = getattr(department, "id", None)
        location = location_lookup.get(getattr(department, "location_id", None))
        department_rows.append(
            {
                "id": department_id,
                "name": getattr(department, "name", "") or "",
                "location_name": getattr(location, "name", "") if location else "",
                "location_type": getattr(location, "type", "") if location else "",
                "members": roots_by_department.get(department_id, []),
            }
        )

    return department_rows
