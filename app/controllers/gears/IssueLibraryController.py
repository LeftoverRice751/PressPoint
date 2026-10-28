"""Story Library, Published tab: duplicate or print one of the signed-in
editor's own past newsletters. Thin -- the rules live in IssueLibrary."""

import traceback

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.services import IssueLibrary, Issues
from app.services.AjaxResponses import json_errors, json_success, wants_json


def _user_id(request):
    try:
        user = request.user() if callable(getattr(request, "user", None)) else None
    except Exception:
        return None
    return getattr(user, "id", None) or None


def _issue_id(request):
    try:
        return int(request.param("id"))
    except (TypeError, ValueError):
        return None


def _truthy(value):
    return str(value or "").strip().lower() in ("1", "true", "on", "yes")


class IssueLibraryController(Controller):
    def duplicate(self, request: Request, response: Response):
        is_ajax = wants_json(request)

        def _err(messages, status):
            if is_ajax:
                return json_errors(response, messages, status=status)
            return response.back().with_errors(messages)

        issue_id = _issue_id(request)
        if issue_id is None:
            return _err(["Newsletter not found."], 404)

        try:
            result = IssueLibrary.duplicate(
                _user_id(request), issue_id, discard=_truthy(request.input("discard"))
            )
        except IssueLibrary.NotFound:
            return _err(["Newsletter not found."], 404)
        except IssueLibrary.NotPublished:
            return _err(["Only published newsletters can be duplicated."], 422)
        except IssueLibrary.DraftInProgress as draft:
            message = (
                f"Your current draft has {draft.story_count} "
                f"{'story' if draft.story_count == 1 else 'stories'}."
            )
            if is_ajax:
                # Not json_errors(): the drawer needs the count to word its
                # confirm dialog, and json_errors() carries messages only.
                return response.json({
                    "ok": False,
                    "needs_confirm": True,
                    "draft_story_count": draft.story_count,
                    "errors": [message],
                }, status=409)
            return response.back().with_errors([message + " Publish or discard it first."])
        except Exception as exception:
            traceback.print_exception(type(exception), exception, exception.__traceback__)
            return _err(["Could not duplicate the newsletter. Please try again."], 500)

        message = f"Issue {result['number']:02d} created as a draft."
        if is_ajax:
            return json_success(response, payload=result, messages=[message])
        return response.redirect(
            name="gears.dashboard", query_params={"page": "news"}
        ).with_success([message])

    def print_view(self, view: View, request: Request, response: Response):
        issue = Issues.owned_issue(_user_id(request), _issue_id(request))
        # Published only: the open draft is printed from the composer, not
        # here, and an unpublished issue gets the same 404 as someone else's.
        stories = Issues.stories_of(issue) if issue is not None else []
        if not any(Issues.is_visible(s) for s in stories):
            return response.view("Not found", status=404)
        context = IssueLibrary.print_context(
            issue, autoprint=_truthy(request.input("autoprint")), stories=stories)
        return view.render("gears/issue-print", context)
