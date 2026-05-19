from masonite.middleware import Middleware


class DatabaseReconnectMiddleware(Middleware):
    """Reset the singleton QueryBuilder's cached MySQL connection before
    every request.

    MasoniteORM's QueryBuilder is bound as a singleton and caches its
    connection in self._connection. MySQL REPEATABLE READ isolation means
    that connection holds a snapshot from its first query, making all
    subsequent reads in the same Gunicorn worker return stale data until
    the worker is restarted. Clearing _connection forces a fresh
    connection (new snapshot) for every HTTP request.
    """

    def before(self, request, response):
        try:
            builder = request.app().make("builder")
            conn = getattr(builder, "_connection", None)
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass
                builder._connection = None
        except Exception:
            pass
        return request

    def after(self, request, response):
        return response
