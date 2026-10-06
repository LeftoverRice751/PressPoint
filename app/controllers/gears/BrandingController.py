"""Site logo upload. The shipped gears.png is never overwritten, so 'Restore default' always works."""

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response

from app.services import Branding
from app.services.AjaxResponses import wants_json, json_success, json_errors
from app.services.ImageUploads import save_uploaded_image


def _editor_redirect(response: Response):
    return response.redirect(name="gears.dashboard", query_params={"page": "branding"})


class BrandingController(Controller):
    def upload(self, request: Request, response: Response):
        stored_path, err = save_uploaded_image(
            request.input("file"), Branding.NAS_SUBDIR, "logo"
        )
        if err:
            if wants_json(request):
                return json_errors(response, [err])
            return _editor_redirect(response).with_errors([err])

        Branding.set_logo(stored_path)

        if wants_json(request):
            return json_success(
                response,
                payload={"logo_url": Branding.logo_url()},
                messages=["Logo updated."],
            )
        return _editor_redirect(response).with_success(["Logo updated."])

    def restore(self, request: Request, response: Response):
        Branding.clear_logo()

        if wants_json(request):
            return json_success(
                response,
                payload={"logo_url": Branding.logo_url()},
                messages=["Default logo restored."],
            )
        return _editor_redirect(response).with_success(["Default logo restored."])
