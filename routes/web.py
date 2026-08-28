from routes.auth import ROUTES as AUTH_ROUTES
from routes.dashboard import ROUTES as DASHBOARD_ROUTES
from routes.public import ROUTES as PUBLIC_ROUTES
from routes.map import ROUTES as MAP_ROUTES
from routes.super_admin import ROUTES as SUPER_ADMIN_ROUTES


ROUTES = PUBLIC_ROUTES + DASHBOARD_ROUTES + AUTH_ROUTES + MAP_ROUTES + SUPER_ADMIN_ROUTES
