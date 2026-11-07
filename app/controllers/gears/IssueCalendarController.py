"""Add an event to, or remove one from, the signed-in editor's open newsletter.

Routes are "auth" only because the issue is never named by the request:
IssueCalendar always resolves it from the signed-in user, so there is no id to
guess and no other editor's calendar to reach.
"""

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response

from app.services import IssueCalendar
from app.services.AjaxResponses import json_errors, json_success


class IssueCalendarController(Controller):
    def attach(self, request: Request, response: Response):
        return self._change(request, response, IssueCalendar.attach)

    def remove(self, request: Request, response: Response):
        return self._change(request, response, IssueCalendar.detach)

    @staticmethod
    def _change(request, response, operation):
        # @event_id:int on the route, so this cannot be anything but digits.
        event_id = int(request.param("event_id"))
        try:
            summary = operation(request.user().id, event_id)
        except IssueCalendar.CalendarRefused as refused:
            return json_errors(response, [refused.message], status=refused.status)
        return json_success(response, payload={"calendar": summary})
