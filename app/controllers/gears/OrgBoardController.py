import os
import traceback

from masonite.controllers import Controller
from masonite.filesystem import Storage
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.models.Organization import Organization
from app.models.Member import Member
from app.services.AjaxResponses import wants_json, json_success, json_errors
from app.services.FileVerificationService import FileVerificationService
from app.services.OrgBoardTree import (
    build_member_tree,
    build_org_board_organizations,
    member_sort_key as _member_sort_key,
    member_node,
    organization_sort_key as _organization_sort_key,
)


ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def _dashboard_redirect(response: Response):
    return response.redirect(name="gears.dashboard", query_params={"page": "org-board"})


def _int_or_none(raw_value):
    """Parse an optional integer from form text or decoded JSON. Bools are refused."""
    if raw_value is None or isinstance(raw_value, bool):
        return None

    if isinstance(raw_value, int):
        return raw_value

    if isinstance(raw_value, float):
        if raw_value != raw_value or abs(raw_value) == float("inf"):  # NaN / inf
            return None
        return int(raw_value)

    text = str(raw_value).strip()
    if not text:
        return None

    try:
        return int(float(text))
    except (TypeError, ValueError):
        return None


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

    def _next_sort_order(self, members, organization_id, parent_id):
        values = [
            int(getattr(row, "sort_order", 0) or 0)
            for row in members
            if getattr(row, "organization_id", None) == organization_id
            and getattr(row, "parent_id", None) == parent_id
        ]
        return (max(values) if values else 0) + 1

    def _renumber_group(self, members):
        for index, row in enumerate(members, start=1):
            if getattr(row, "sort_order", None) != index:
                row.sort_order = index
                row.save()

    def _sibling_group(self, members, organization_id, parent_id, excluded_ids=None):
        excluded_ids = excluded_ids or set()
        return sorted(
            [
                row for row in members
                if getattr(row, "id", None) not in excluded_ids
                and getattr(row, "organization_id", None) == organization_id
                and getattr(row, "parent_id", None) == parent_id
            ],
            key=_member_sort_key,
        )

    def _organization_members(self, organization_id):
        """Members of one organization, as serialized root nodes."""
        members = [
            row for row in self._all_members()
            if getattr(row, "organization_id", None) == organization_id
        ]
        return build_member_tree(members).get(organization_id, [])

    def _organization_payload(self, organization_id):
        return {
            "organization_id": organization_id,
            "members": self._organization_members(organization_id),
        }

    def _save_photo(self, photo_file, storage: Storage):
        """Return (photo_path, error_message). A missing file is not an error."""
        if not photo_file:
            return None, None

        if isinstance(photo_file, str):
            return (photo_file.strip() or None), None

        file_extension = (photo_file.extension() or "").lower()
        if file_extension not in ALLOWED_PHOTO_EXTENSIONS:
            return None, "Please upload a valid image file."

        # The extension is only what the browser claimed.
        if not FileVerificationService.verify_buffer(photo_file.get_content(), "photo"):
            return None, "Please upload a valid image file."

        return storage.disk("public").put_file("org-board", photo_file), None

    def show(self, response: Response):
        return _dashboard_redirect(response)

    def public_show(self, view: View):
        """The kiosk board: every organization, in dropdown order. No locations join."""
        organization_rows = sorted(
            list(Organization.all() or []),
            key=_organization_sort_key,
        )
        members = sorted(
            list(Member.all() or []),
            key=_member_sort_key,
        )

        return view.render(
            "kiosk/org-board",
            {
                "campus_name": "LSPU Organizational Chart",
                "organizations": build_org_board_organizations(organization_rows, members),
                "active_section": "organizations",
                "active_nav": "",
            },
        )

    def data(self, request: Request, response: Response):
        """JSON tree for a single organization, used by the dashboard editor."""
        organization_id = _int_or_none(request.input("organization_id"))
        if organization_id is None:
            return json_errors(response, ["Please choose a valid organization."])

        organization = Organization.find(organization_id)
        if not organization:
            return json_errors(response, ["Please choose a valid organization."])

        return json_success(response, payload=self._organization_payload(organization.id))

    def store(self, request: Request, storage: Storage, response: Response):
        name = (request.input("name") or "").strip()
        position = (request.input("position") or "").strip()
        organization_id_value = (request.input("organization_id") or "").strip()
        parent_id_value = (request.input("parent_id") or "").strip()
        photo_file = _normalize_uploaded_photo(request.input("photo_path"))

        is_ajax = wants_json(request)

        def _err(messages):
            if is_ajax:
                return json_errors(response, messages)
            return _dashboard_redirect(response).with_errors(messages)

        if not name or not position or not organization_id_value:
            return _err(["Name, position, and organization are required."])

        if not organization_id_value.isdigit():
            return _err(["Please choose a valid organization."])

        organization = Organization.find(int(organization_id_value))
        if not organization:
            return _err(["Please choose a valid organization."])

        parent_id = None
        if parent_id_value:
            if not parent_id_value.isdigit():
                return _err(["Please choose a valid supervisor."])

            parent_member = Member.find(int(parent_id_value))
            if not parent_member:
                return _err(["Please choose a valid supervisor."])

            if getattr(parent_member, "organization_id", None) != organization.id:
                return _err(["The supervisor must belong to the same organization."])

            parent_id = parent_member.id

        photo_path, photo_error = self._save_photo(photo_file, storage)
        if photo_error:
            return _err([photo_error])

        try:
            existing_members = self._all_members()
            sort_order = self._next_sort_order(existing_members, organization.id, parent_id)

            member = Member.create({
                "name": name,
                "position": position,
                "organization_id": organization.id,
                "parent_id": parent_id,
                "photo_path": photo_path,
                "sort_order": sort_order,
            })

            if is_ajax:
                payload = self._organization_payload(organization.id)
                payload["member"] = member_node(member)
                return json_success(response, payload=payload, messages=["Member added successfully."])

            return _dashboard_redirect(response).with_success([
                "Member added successfully.",
            ])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not save the member. Please try again."])

    def reorder(self, request: Request, response: Response):
        """Swap a member with the sibling before or after them (`direction` =
        "earlier" / "later"), then renumber that group 1..n.

        Order is the one thing an editor arranges by hand now that the chart is
        laid out from the hierarchy alone; the kiosk reads it straight from
        `sort_order` through member_sort_key. Renumbering the whole group on
        every swap, rather than trading two values, is what heals the duplicate
        and gapped sort_orders older rows carry -- with two siblings both at 0 a
        bare swap would change nothing and the button would appear dead.
        """
        member_id = _int_or_none(request.input("member_id"))
        direction = (request.input("direction") or "").strip().lower()
        if direction not in ("earlier", "later"):
            return json_errors(response, ["Please choose to move the member earlier or later."])

        members = self._all_members()
        member = next((row for row in members if getattr(row, "id", None) == member_id), None)
        if member_id is None or member is None:
            return json_errors(response, ["Please choose a valid member."])

        organization_id = getattr(member, "organization_id", None)
        group = self._sibling_group(members, organization_id, getattr(member, "parent_id", None))
        index = next(i for i, row in enumerate(group) if row is member)
        target = index - 1 if direction == "earlier" else index + 1

        if target < 0 or target >= len(group):
            edge = "first" if direction == "earlier" else "last"
            return json_errors(response, [f"{member.name} is already {edge}."])

        group[index], group[target] = group[target], group[index]

        try:
            self._renumber_group(group)
            return json_success(
                response,
                payload=self._organization_payload(organization_id),
                messages=["Order updated."],
            )
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return json_errors(response, ["Could not change the order. Please try again."])

    def update(self, request: Request, storage: Storage, response: Response):
        member_id = _int_or_none(request.input("member_id"))
        if member_id is None:
            return json_errors(response, ["Please choose a valid member."])

        member = Member.find(member_id)
        if not member:
            return json_errors(response, ["Please choose a valid member."])

        source_organization_id = getattr(member, "organization_id", None)
        name = (request.input("name") or "").strip()
        position = (request.input("position") or "").strip()

        if not name or not position:
            return json_errors(response, ["Name and position are required."])

        members = self._all_members()
        branch_ids = self._branch_ids(members, member.id)

        target_organization_id = source_organization_id
        if request.input("organization_id", None) is not None:
            organization_id = _int_or_none(request.input("organization_id"))
            if organization_id is None:
                return json_errors(response, ["Please choose a valid organization."])

            organization = Organization.find(organization_id)
            if not organization:
                return json_errors(response, ["Please choose a valid organization."])

            target_organization_id = organization.id

        target_parent_id = getattr(member, "parent_id", None)
        if request.input("parent_id", None) is not None:
            parent_id = _int_or_none(request.input("parent_id"))
            if parent_id is None:
                target_parent_id = None
            else:
                if parent_id in branch_ids:
                    return json_errors(
                        response,
                        ["A member cannot report to itself or to one of its own subordinates."],
                    )

                parent_member = Member.find(parent_id)
                if not parent_member:
                    return json_errors(response, ["Please choose a valid supervisor."])

                if getattr(parent_member, "organization_id", None) != target_organization_id:
                    return json_errors(response, ["The supervisor must belong to the same organization."])

                target_parent_id = parent_member.id

        if target_organization_id != source_organization_id and target_parent_id == getattr(member, "parent_id", None):
            # An organization change without a new supervisor makes the member a root there.
            target_parent_id = None

        photo_path, photo_error = self._save_photo(
            _normalize_uploaded_photo(request.input("photo_path")), storage
        )
        if photo_error:
            return json_errors(response, [photo_error])

        source_parent_id = getattr(member, "parent_id", None)
        changed_group = (
            target_parent_id != source_parent_id
            or target_organization_id != source_organization_id
        )

        try:
            member.name = name
            member.position = position
            member.parent_id = target_parent_id
            if photo_path:
                member.photo_path = photo_path
            if changed_group:
                # Joins the end of the new group; the order buttons move them
                # from there. Keeping the old sort_order dropped them at some
                # arbitrary place among strangers.
                member.sort_order = self._next_sort_order(
                    members, target_organization_id, target_parent_id
                )

            if target_organization_id != source_organization_id:
                # The whole branch follows; pinned positions are meaningless on the new canvas.
                branch_rows = [row for row in members if getattr(row, "id", None) in branch_ids]
                for row in branch_rows:
                    if getattr(row, "id", None) == member.id:
                        continue
                    row.organization_id = target_organization_id
                    row.pos_x = None
                    row.pos_y = None
                    row.save()

                member.organization_id = target_organization_id
                member.pos_x = None
                member.pos_y = None

            member.save()

            if changed_group:
                # Close the gap in the group they left. This used to renumber the
                # member's *new* group (it read parent_id after assigning it) and
                # leave the old one gapped; drag-to-reparent went through move(),
                # which got it right, so nobody saw it until the dialog became the
                # only way to change a supervisor.
                self._renumber_group(
                    self._sibling_group(
                        self._all_members(),
                        source_organization_id,
                        source_parent_id,
                        excluded_ids=branch_ids,
                    )
                )

            payload = self._organization_payload(target_organization_id)
            payload["moved_organization"] = target_organization_id != source_organization_id
            return json_success(response, payload=payload, messages=["Member updated."])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return json_errors(response, ["Could not update the member. Please try again."])

    def photo(self, request: Request, storage: Storage, response: Response):
        """Set one member's portrait, used by dropping an image onto a card."""
        member_id = _int_or_none(request.input("member_id"))
        if member_id is None:
            return json_errors(response, ["Please choose a valid member."])

        member = Member.find(member_id)
        if not member:
            return json_errors(response, ["Please choose a valid member."])

        photo_file = _normalize_uploaded_photo(request.input("photo_path"))
        if not photo_file:
            return json_errors(response, ["Please choose an image to upload."])

        photo_path, photo_error = self._save_photo(photo_file, storage)
        if photo_error:
            return json_errors(response, [photo_error])

        try:
            member.photo_path = photo_path
            member.save()

            return json_success(
                response,
                payload={
                    "member_id": member.id,
                    "photo_path": photo_path,
                    "organization_id": getattr(member, "organization_id", None),
                },
                messages=["Photo updated."],
            )
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return json_errors(response, ["Could not save the photo. Please try again."])

    def destroy(self, request: Request, response: Response):
        """Delete a member, promoting their subordinates to their own supervisor."""
        member_id = _int_or_none(request.input("member_id"))
        if member_id is None:
            return json_errors(response, ["Please choose a valid member."])

        member = Member.find(member_id)
        if not member:
            return json_errors(response, ["Please choose a valid member."])

        organization_id = getattr(member, "organization_id", None)
        promoted_parent_id = getattr(member, "parent_id", None)

        try:
            subordinates = [
                row for row in self._all_members()
                if getattr(row, "parent_id", None) == member.id
            ]
            # Re-point children before the delete so ON DELETE CASCADE never reaches them.
            for row in subordinates:
                row.parent_id = promoted_parent_id
                row.save()

            member.delete()

            payload = self._organization_payload(organization_id)
            payload["promoted"] = len(subordinates)
            return json_success(response, payload=payload, messages=["Member removed."])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return json_errors(response, ["Could not remove the member. Please try again."])

    # --- organizations ---------------------------------------------------

    def _organization_name_taken(self, name, excluding_id=None):
        """The name column is UNIQUE; catch it here for a readable message."""
        needle = name.strip().lower()
        for row in Organization.all() or []:
            if getattr(row, "id", None) == excluding_id:
                continue
            if (getattr(row, "name", "") or "").strip().lower() == needle:
                return True
        return False

    def _organization_member_count(self, organization_id):
        return len([
            row for row in self._all_members()
            if getattr(row, "organization_id", None) == organization_id
        ])

    def store_organization(self, request: Request, response: Response):
        name = (request.input("name") or "").strip()
        kind = Organization.normalize_kind(request.input("kind"))
        is_ajax = wants_json(request)

        def _err(messages):
            if is_ajax:
                return json_errors(response, messages)
            return _dashboard_redirect(response).with_errors(messages)

        if not name:
            return _err(["Please give the organization a name."])

        if kind is None:
            return _err(["Please choose whether this is a department or an organization."])

        if self._organization_name_taken(name):
            return _err([f"“{name}” already exists."])

        try:
            organization = Organization.create({"name": name, "kind": kind})

            if is_ajax:
                return json_success(
                    response,
                    payload={
                        "organization": {
                            "id": organization.id,
                            "name": organization.name,
                            "kind": kind,
                            "kind_label": Organization.label_for(kind),
                        }
                    },
                    messages=[f"{Organization.label_for(kind)} added."],
                )

            return _dashboard_redirect(response).with_success([
                f"{Organization.label_for(kind)} added.",
            ])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not save the organization. Please try again."])

    def update_organization(self, request: Request, response: Response):
        organization_id = _int_or_none(request.input("organization_id"))
        is_ajax = wants_json(request)

        def _err(messages):
            if is_ajax:
                return json_errors(response, messages)
            return _dashboard_redirect(response).with_errors(messages)

        if organization_id is None:
            return _err(["Please choose a valid organization."])

        organization = Organization.find(organization_id)
        if not organization:
            return _err(["Please choose a valid organization."])

        name = (request.input("name") or "").strip()
        if not name:
            return _err(["Please give the organization a name."])

        if self._organization_name_taken(name, excluding_id=organization.id):
            return _err([f"“{name}” already exists."])

        # Kind is optional on update: a rename-only submit leaves it alone.
        kind = getattr(organization, "kind", None)
        if request.input("kind", None) is not None:
            kind = Organization.normalize_kind(request.input("kind"))
            if kind is None:
                return _err(["Please choose whether this is a department or an organization."])

        try:
            organization.name = name
            organization.kind = kind
            organization.save()

            if is_ajax:
                return json_success(
                    response,
                    payload={
                        "organization": {
                            "id": organization.id,
                            "name": name,
                            "kind": kind,
                            "kind_label": Organization.label_for(kind),
                        }
                    },
                    messages=["Organization updated."],
                )

            return _dashboard_redirect(response).with_success(["Organization updated."])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not update the organization. Please try again."])

    def destroy_organization(self, request: Request, response: Response):
        organization_id = _int_or_none(request.input("organization_id"))
        is_ajax = wants_json(request)

        def _err(messages):
            if is_ajax:
                return json_errors(response, messages)
            return _dashboard_redirect(response).with_errors(messages)

        if organization_id is None:
            return _err(["Please choose a valid organization."])

        organization = Organization.find(organization_id)
        if not organization:
            return _err(["Please choose a valid organization."])

        # members.organization_id is ON DELETE CASCADE; don't wipe a chart silently.
        member_count = self._organization_member_count(organization.id)
        if member_count:
            plural = "member" if member_count == 1 else "members"
            return _err([
                f"“{organization.name}” still has {member_count} {plural}. "
                f"Remove them from its chart first.",
            ])

        try:
            name = organization.name
            organization.delete()

            if is_ajax:
                return json_success(
                    response,
                    payload={"organization_id": organization_id},
                    messages=[f"“{name}” removed."],
                )

            return _dashboard_redirect(response).with_success([f"“{name}” removed."])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not remove the organization. Please try again."])
