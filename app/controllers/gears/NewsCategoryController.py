"""Category CRUD for news stories.

Thin by design (CLAUDE.md): every decision lives in
app/services/NewsCategories.py, and this file is routing plus response
shaping.

The shaping is the interesting part. `store` has three success-ish outcomes
and they are distinguished by an `outcome` string in the PAYLOAD, not by the
HTTP status. The browser switches on that string and never reads the status.
Two reasons:

  1. "This category already exists" is not a failure. The caller's actual goal
     is "give me a category id to assign this story to", and an existing row
     meets it. Returning that through json_errors would be actively worse:
     that envelope is {ok: false, errors: [...]} with no payload slot, so the
     modal would have to parse an id out of an English sentence.

  2. It makes the create race disappear from the client entirely. When two
     editors submit the same new name at once, the loser gets back exactly the
     body the winner would have produced a millisecond later — so the JS needs
     no race-specific branch at all.

Permission model, stated because it is unusual for this file: these routes
carry `auth` only. Any signed-in editor may create, rename, delete and restore
a category — and a delete cascades a soft-delete to every story in it,
including published ones, pulling them off the campus kiosk. That was a
deliberate product decision. The guard is the confirmation dialog's story
count, not a role, and everything here is recoverable. Do not "fix" this by
adding the `admin` middleware without checking first.
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
        """Every live category, with the number of live stories in each.

        The count is what the delete confirmation has to state, so it ships
        with the list rather than costing a second round trip per delete
        click.
        """
        # describe_all, not a describe() per row: the counts come from one
        # GROUP BY rather than one COUNT per category.
        return json_success(
            response, payload={"categories": NewsCategories.describe_all()}
        )

    def store(self, request: Request, response: Response):
        """Create a category, or report what already holds that name.

        Outcomes and their statuses:
          created    -> 201
          exists     -> 200, ok:true  (select it; not an error)
          restorable -> 409, ok:true  (offer restore; NEVER auto-restore)

        Auto-restoring here would resurrect every story that was cascade-
        deleted with the category, published ones included, straight back onto
        the campus kiosk on what the editor experienced as a typo. It has to
        be a second, explicit click.
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
        """Rename a category.

        Stories keep their association by foreign key, so this changes the
        label everywhere — the kiosk included — without touching a single news
        row. Same uniqueness and normalisation as create, so renaming onto an
        existing name reports it the same way rather than throwing a
        duplicate-key error at the editor.
        """
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
        """Soft-delete a category and every story assigned to it.

        Both halves are recoverable via restore. The story count is returned
        so the composer can say exactly what happened after the fact, as well
        as before it.
        """
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
        """Bring back a soft-deleted category and its stories.

        Symmetric with destroy on purpose: a delete that cascades and a
        restore that does not would leave an editor with an empty category and
        no obvious way to get their stories back.
        """
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
