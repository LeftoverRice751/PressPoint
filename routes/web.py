from routes.auth import ROUTES as AUTH_ROUTES
from routes.dashboard import ROUTES as DASHBOARD_ROUTES
from routes.public import ROUTES as PUBLIC_ROUTES


ROUTES = PUBLIC_ROUTES + DASHBOARD_ROUTES + AUTH_ROUTES
