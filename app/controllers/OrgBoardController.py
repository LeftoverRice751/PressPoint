import os
import traceback

from masonite.controllers import Controller
from masonite.filesystem import Storage
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.models.Departments import Departments
from app.models.Member import Member
from app.services.AjaxResponses import wants_json, json_success, json_errors


ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def _member_sort_key(member):
    return (
        int(getattr(member, "sort_order", 0) or 0),
        (getattr(member, "name", "") or "").strip().lower(),
        int(getattr(member, "id", 0) or 0),
    )


def _dashboard_redirect(response: Response):
    return response.redirect(name="gears.dashboard", query_params={"page": "org-board"})


def _normalize_uploaded_photo(photo_file):
    if isinstance(photo_file, list):
        photo_file = photo_file[0] if photo_file else None

    if photo_file and not hasattr(photo_file, "name") and hasattr(photo_file, "filename"):
        class _UploadedPhotoAdapter:
            def __init__(self, file_obj):
                self._file_obj = file_obj
                self.name = getattr(file_obj, "filename", "upload")

            def extension(self):
                if hasattr(self._file_obj, "extension"):
                    return self._file_obj.extension()

                filename = getattr(self._file_obj, "filename", "") or ""
                return os.path.splitext(filename)[1]

            def get_content(self):
                if hasattr(self._file_obj, "get_content"):
                    return self._file_obj.get_content()

                if hasattr(self._file_obj, "stream"):
                    stream = self._file_obj.stream()
                    return stream.read() if hasattr(stream, "read") else stream

                return getattr(self._file_obj, "content", b"")

        return _UploadedPhotoAdapter(photo_file)

    return photo_file


class OrgBoardController(Controller):
    def _all_members(self):
        return list(Member.all() or [])

    def _branch_ids(self, members, member_id):
        children_map = {}
        for row in members:
            parent_id = getattr(row, "parent_id", None)
            children_map.setdefault(parent_id, []).append(row)

        for child_rows in children_map.values():
            child_rows.sort(key=_member_sort_key)

        branch_ids = set()
        stack = [member_id]
        while stack:
            current_id = stack.pop()
            if current_id in branch_ids:
                continue
            branch_ids.add(current_id)
            for child_row in children_map.get(current_id, []):
                stack.append(getattr(child_row, "id", None))

        return branch_ids

    def _next_sort_order(self, members, department_id, parent_id):
        values = [
            int(getattr(row, "sort_order", 0) or 0)
            for row in members
            if getattr(row, "department_id", None) == department_id
            and getattr(row, "parent_id", None) == parent_id
        ]
        return (max(values) if values else 0) + 1

    def _renumber_group(self, members):
        for index, row in enumerate(members, start=1):
            if getattr(row, "sort_order", None) != index:
                row.sort_order = index
                row.save()

    def _sibling_group(self, members, department_id, parent_id, excluded_ids=None):
        excluded_ids = excluded_ids or set()
        return sorted(
            [
                row for row in members
                if getattr(row, "id", None) not in excluded_ids
                and getattr(row, "department_id", None) == department_id
                and getattr(row, "parent_id", None) == parent_id
            ],
            key=_member_sort_key,
        )

    def _find_index(self, members, member_id):
        for index, row in enumerate(members):
            if getattr(row, "id", None) == member_id:
                return index
        return None

    def show(self, response: Response):
        return _dashboard_redirect(response)

    def public_show(self, view: View):
        from app.models.Locations import Locations
        from app.controllers.VideoController import _build_org_board_departments

        locations = list(Locations.all() or [])
        location_type_lookup = {
            getattr(l, "id", None): (getattr(l, "type", "") or "")
            for l in locations
        }
        departments_rows = sorted(
            [
                d for d in list(Departments.all() or [])
                if location_type_lookup.get(getattr(d, "location_id", None), "") == "Department"
            ],
            key=lambda item: (getattr(item, "name", "") or "").lower(),
        )
        members = sorted(
            list(Member.all() or []),
            key=_member_sort_key,
        )
        department_rows = _build_org_board_departments(departments_rows, locations, members)

        return view.render(
            "kiosk/org-board",
            {
                "campus_name": "LSPU Organizational Chart",
                "departments": department_rows,
                "active_section": "departments",
                "active_nav": "",
            },
        )

    def store(self, request: Request, storage: Storage, response: Response):
        name = (request.input("name") or "").strip()
        position = (request.input("position") or "").strip()
        department_id_value = (request.input("department_id") or "").strip()
        parent_id_value = (request.input("parent_id") or "").strip()
        photo_file = _normalize_uploaded_photo(request.input("photo_path"))

        is_ajax = wants_json(request)

        def _err(messages):
            if is_ajax:
                return json_errors(response, messages)
            return _dashboard_redirect(response).with_errors(messages)

        if not name or not position or not department_id_value:
            return _err(["Name, position, and department are required."])

        if not department_id_value.isdigit():
            return _err(["Please choose a valid department."])

        department = Departments.find(int(department_id_value))
        if not department:
            return _err(["Please choose a valid department."])

        parent_id = None
        if parent_id_value:
            if not parent_id_value.isdigit():
                return _err(["Please choose a valid supervisor."])

            parent_member = Member.find(int(parent_id_value))
            if not parent_member:
                return _err(["Please choose a valid supervisor."])

            if getattr(parent_member, "department_id", None) != department.id:
                return _err(["The supervisor must belong to the same department."])

            parent_id = parent_member.id

        photo_path = None
        if photo_file:
            if isinstance(photo_file, str):
                photo_path = photo_file.strip() or None
            else:
                file_extension = (photo_file.extension() or "").lower()
                if file_extension not in ALLOWED_PHOTO_EXTENSIONS:
                    return _err(["Please upload a valid image file."])

                photo_path = storage.disk("public").put_file("org-board", photo_file)

        try:
            existing_members = self._all_members()
            sort_order = self._next_sort_order(existing_members, department.id, parent_id)

            member = Member.create({
                "name": name,
                "position": position,
                "department_id": department.id,
                "parent_id": parent_id,
                "photo_path": photo_path,
                "sort_order": sort_order,
            })

            if is_ajax:
                return json_success(response, payload={
                    "member": {
                        "id": getattr(member, "id", None),
                        "name": name,
                        "position": position,
                        "department_id": department.id,
                        "photo_path": photo_path,
                    }
                }, messages=["Member added successfully."])

            return _dashboard_redirect(response).with_success([
                "Member added successfully.",
            ])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not save the member. Please try again."])

    def reorder(self, request: Request, response: Response):
        member_id_value = (request.input("member_id") or "").strip()
        dropzone = (request.input("dropzone") or "").strip().lower()
        anchor_id_value = (request.input("anchor_id") or "").strip()
        department_id_value = (request.input("department_id") or "").strip()

        if not member_id_value.isdigit():
            return _dashboard_redirect(response).with_errors([
                "Please choose a valid member.",
            ])

        member = Member.find(int(member_id_value))
        if not member:
            return _dashboard_redirect(response).with_errors([
                "Please choose a valid member.",
            ])

        members = self._all_members()
        branch_ids = self._branch_ids(members, member.id)

        target_anchor = None
        target_department_id = getattr(member, "department_id", None)
        target_parent_id = getattr(member, "parent_id", None)

        if dropzone == "root":
            if not department_id_value.isdigit():
                return _dashboard_redirect(response).with_errors([
                    "Please choose a valid department.",
                ])

            department = Departments.find(int(department_id_value))
            if not department:
                return _dashboard_redirect(response).with_errors([
                    "Please choose a valid department.",
                ])

            target_department_id = department.id
            target_parent_id = None
            placement = "append"
        elif dropzone in ("before", "after", "child"):
            if not anchor_id_value.isdigit():
                return _dashboard_redirect(response).with_errors([
                    "Please choose a valid drop target.",
                ])

            target_anchor = Member.find(int(anchor_id_value))
            if not target_anchor:
                return _dashboard_redirect(response).with_errors([
                    "Please choose a valid drop target.",
                ])

            if getattr(target_anchor, "id", None) in branch_ids:
                return _dashboard_redirect(response).with_errors([
                    "A member cannot be dropped inside itself or one of its subordinates.",
                ])

            target_department_id = getattr(target_anchor, "department_id", None)
            if dropzone == "child":
                target_parent_id = target_anchor.id
                placement = "append"
            else:
                target_parent_id = getattr(target_anchor, "parent_id", None)
                placement = dropzone
        else:
            return _dashboard_redirect(response).with_errors([
                "Please choose a valid drop zone.",
            ])

        source_department_id = getattr(member, "department_id", None)
        source_parent_id = getattr(member, "parent_id", None)

        branch_members = [row for row in members if getattr(row, "id", None) in branch_ids]
        if target_department_id != source_department_id:
            for row in branch_members:
                row.department_id = target_department_id
                row.save()

        member.department_id = target_department_id
        member.parent_id = target_parent_id
        member.save()

        source_group = self._sibling_group(members, source_department_id, source_parent_id, excluded_ids=branch_ids)
        destination_group = source_group if (source_department_id, source_parent_id) == (target_department_id, target_parent_id) else self._sibling_group(members, target_department_id, target_parent_id, excluded_ids=branch_ids)

        if placement == "before" and target_anchor:
            insert_index = self._find_index(destination_group, target_anchor.id)
            insert_index = insert_index if insert_index is not None else len(destination_group)
        elif placement == "after" and target_anchor:
            insert_index = self._find_index(destination_group, target_anchor.id)
            insert_index = (insert_index + 1) if insert_index is not None else len(destination_group)
        else:
            insert_index = len(destination_group)

        destination_group.insert(insert_index, member)

        if (source_department_id, source_parent_id) == (target_department_id, target_parent_id):
            self._renumber_group(destination_group)
        else:
            self._renumber_group(source_group)
            self._renumber_group(destination_group)

        return _dashboard_redirect(response).with_success([
            "Member order updated.",
        ])
