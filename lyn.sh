#!/usr/bin/env bash
# Start PressPoint under gunicorn, behind nginx on the unix socket.
#
#   ./lyn.sh
#
# This file was empty, so the running server's invocation existed only in
# process memory — after a reboot there was nothing to restart it from.
set -euo pipefail

cd "$(dirname "$0")"

# WORKERS: separate PROCESSES, never threads.
#
# Do NOT add --threads or --worker-class gthread. Masonite resolves Response
# as a container singleton, so concurrent threads inside one process race on
# the same response object — the same defect that made `craft serve --threaded`
# unusable here. Each process gets its own container, so processes are safe.
#
# 4 cores would suggest the textbook (2*N)+1 = 9. Starting at 5 instead: with
# static files served by nginx (see deploy/nginx-presspoint.conf) the remaining
# requests are short, and RSS-per-worker on this box has to be measured before
# committing more of ~2.8GB free RAM. Raise toward 9 once measured.
WORKERS="${WORKERS:-5}"

# LOGS: in the repo's own storage/framework/logs (gitignored, beside the
# framework's exceptions.log), not /tmp. /tmp is world-writable and emptied on
# reboot, so the access log -- the record of who hit what -- vanished exactly
# when an incident made it worth reading (SECURITY.md W9). Rotation is
# deploy/logrotate-presspoint.
LOG_DIR="${LOG_DIR:-storage/framework/logs}"
mkdir -p "$LOG_DIR"

# The default format's first field is the peer address, which on a unix socket
# is empty -- every line began "-", so the log never said who made a request.
# X-Real-IP is the address nginx resolved and overwrites, the same one the
# throttle and the audit log trust (app/rate_limiters.py:client_ip).
ACCESS_FORMAT='%({x-real-ip}i)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(L)ss'

# BIND: overridable only so this exact script can be exercised on a scratch
# socket; production is always the default, which nginx proxies to.
BIND="${BIND:-unix:presspoint.sock}"

exec venv/bin/gunicorn \
  --workers "$WORKERS" \
  --timeout 120 \
  --graceful-timeout 30 \
  --max-requests 500 --max-requests-jitter 50 \
  --access-logfile "$LOG_DIR/gunicorn-access.log" \
  --access-logformat "$ACCESS_FORMAT" \
  --error-logfile "$LOG_DIR/gunicorn-error.log" \
  --bind "$BIND" \
  wsgi:application
