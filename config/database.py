from masonite.environment import LoadEnvironment, env
from masoniteorm.connections import ConnectionResolver

#  Loads in the environment variables when this page is imported.
LoadEnvironment()

"""
The connections here don't determine the database but determine the "connection".
They can be named whatever you want.
"""
DATABASES = {
    # MySQL is the only database this app runs on. A `sqlite` connection used to
    # sit here, selected by .env.testing, and quietly pointed a misconfigured run
    # at an empty masonite.sqlite3 (SECURITY.md W12); naming any other connection
    # now fails at the first query instead.
    "default": env("DB_CONNECTION", "mysql"),
    "mysql": {
        "driver": "mysql",
        "host": env("DB_HOST"),
        "user": env("DB_USERNAME"),
        "password": env("DB_PASSWORD"),
        "database": env("DB_DATABASE"),
        "port": env("DB_PORT"),
        "prefix": "",
        "grammar": "mysql",
        "options": {
            "charset": "utf8mb4",
        },
        "log_queries": env("DB_LOG"),
    },
    "postgres": {
        "driver": "postgres",
        "host": env("DB_HOST"),
        "user": env("DB_USERNAME"),
        "password": env("DB_PASSWORD"),
        "database": env("DB_DATABASE"),
        "port": env("DB_PORT"),
        "prefix": "",
        "grammar": "postgres",
        "log_queries": env("DB_LOG"),
    },
    "mssql": {
        "driver": "mssql",
        "host": env("MSSQL_DATABASE_HOST"),
        "user": env("MSSQL_DATABASE_USER"),
        "password": env("MSSQL_DATABASE_PASSWORD"),
        "database": env("MSSQL_DATABASE_DATABASE"),
        "port": env("MSSQL_DATABASE_PORT"),
        "prefix": "",
        "log_queries": env("DB_LOG"),
    },
}

DB = ConnectionResolver().set_connection_details(DATABASES)
