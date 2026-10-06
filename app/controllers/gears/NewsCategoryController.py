"""Category CRUD for news stories. Logic lives in app/services/NewsCategories.py.

Outcomes are reported by an `outcome` string in the payload, not the HTTP
status: "already exists" is not an error to the composer, and it makes the
create race invisible to the client.

Routes carry `auth` only, deliberately: any editor may delete a category, which
soft-deletes its stories (recoverable via restore). Don't add `admin` here
without checking first.
"""

import traceback

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response

from app.services import NewsCategories
from app.services.AjaxResponses import wants_json, json_success, json_errors


class NewsCategoryController(Controller):
    def _err(self, request, response, messages, status=422):
        if wants_json(request):
            return json_errors(response, messages, status=status)
        return response.back().with_errors(messages)

    def index(self, request: Request, response: Response):
        """Every live category with its live story count (one GROUP BY), for the delete dialog."""
        return json_success(
            response, payload={"categories": NewsCategories.describe_all()}
        )

    def store(self, request: Request, response: Response):
        """Create a category, or report what already holds that name.

        created -> 201; exists -> 200 (select it); restorable -> 409 (offer restore,
        never auto-restore: that would resurrect its stories onto the kiosk).
        """
        try:
            outcome, payload = NewsCategories.resolve_or_offer(request.input("name"))
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return self._err(request, response, ["Could not save the category. Please try again."])

        if outcome == "invalid":
            return self._err(request, response, [
                "Enter a category name of 1 to %d characters." % NewsCategories.MAX_NAME_LENGTH,
            ])

        if outcome == "created":
            return json_success(
                response,
                payload={"outcome": "created", "category": payload},
                messages=["Category created."],
                status=201,
            )

        if outcome == "exists":
            return json_success(
                response,
                payload={"outcome": "exists", "category": payload},
                messages=['"%s" already exists — selected it for you.' % payload["name"]],
            )

        # restorable
        return json_success(
            response,
            payload={
                "outcome": "restorable",
                "category": payload,
                "restore_url": "/gears/news/categories/%s/restore" % payload["id"],
            },
            messages=[self._restorable_message(payload)],
            status=409,
        )

    def _restorable_message(self, payload):
        count = payload.get("trashed_story_count") or 0
        when = payload.get("deleted_label")
        stories = "1 story" if count == 1 else "%d stories" % count
        deleted_on = (" on %s" % when) if when else ""
        return (
            '"%s" was deleted%s. Restoring it will also bring back %s.'
            % (payload.get("name"), deleted_on, stories)
        )

    def update(self, request: Request, response: Response):
        """Rename a category; stories follow by foreign key. Same uniqueness rules as create."""
        try:
            outcome, payload = NewsCategories.rename(
                request.param("id"), request.input("name")
            )
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return self._err(request, response, ["Could not rename the category. Try again."])

        if outcome == "invalid":
            return self._err(request, response, [
                "Enter a category name of 1 to %d characters." % NewsCategories.MAX_NAME_LENGTH,
            ])
        if outcome == "missing":
            return self._err(request, response, ["That category no longer exists."], status=404)
        if outcome == "exists":
            return self._err(request, response, [
                'Another category is already called "%s".' % payload["name"],
            ], status=409)
        if outcome == "restorable":
            return self._err(request, response, [self._restorable_message(payload)], status=409)

        return json_success(
            response,
            payload={"outcome": "renamed", "category": payload},
            messages=["Category renamed."],
        )

    def destroy(self, request: Request, response: Response):
        """Soft-delete a category and every story in it; both come back via restore."""
        try:
            outcome, payload = NewsCategories.soft_delete_cascade(request.param("id"))
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return self._err(request, response, ["Could not delete the category. Try again."])

        if outcome == "missing":
            return self._err(request, response, ["That category no longer exists."], status=404)

        count = payload["deleted_stories"]
        stories = "1 story" if count == 1 else "%d stories" % count
        return json_success(
            response,
            payload={"outcome": "deleted", "category": payload},
            messages=['Deleted "%s" and %s. Both can be restored.' % (payload["name"], stories)],
        )

    def restore(self, request: Request, response: Response):
        """Bring back a soft-deleted category and its stories, symmetric with destroy."""
        try:
            outcome, payload = NewsCategories.restore_cascade(request.param("id"))
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return self._err(request, response, ["Could not restore the category. Try again."])

        if outcome == "missing":
            return self._err(request, response, [
                "That category is not in the trash.",
            ], status=404)

        count = payload["restored_stories"]
        stories = "1 story" if count == 1 else "%d stories" % count
        return json_success(
            response,
            payload={"outcome": "restored", "category": payload},
            messages=['Restored "%s" and %s.' % (payload["name"], stories)],
        )
