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

exec venv/bin/gunicorn \
  --workers "$WORKERS" \
  --timeout 120 \
  --graceful-timeout 30 \
  --max-requests 500 --max-requests-jitter 50 \
  --access-logfile /tmp/presspoint_access.log \
  --error-logfile /tmp/presspoint_gunicorn.log \
  --bind unix:presspoint.sock \
  wsgi:application
