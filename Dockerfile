# Container build. Production on campus runs lyn.sh, not this; the image is for
# anyone deploying elsewhere, so it is hardened as if it were the real thing
# (SECURITY.md W10).

# Stage 1: build frontend assets
# Node 18 to match .nvmrc and package.json engines. Newer Node breaks the
# laravel-mix build with "require is not defined in ES module scope" (yargs).
FROM node:18-alpine AS assets
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci`, not `npm install`: installs exactly package-lock.json and fails if
# it disagrees with package.json, so the image cannot pick up a newer (or
# hijacked) transitive release than the one CI audited.
RUN npm ci
COPY . .
RUN npm run production

# Stage 2: runtime
FROM python:3.11-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    default-libmysqlclient-dev \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# gunicorn is pinned in requirements.txt; it used to be installed a second
# time here, unpinned, which made the image's server version float.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# An unprivileged user owns nothing but the directories the app writes to, so
# a code-execution bug cannot rewrite the application it is running.
RUN groupadd --system app && useradd --system --gid app --home-dir /app --shell /usr/sbin/nologin app

COPY . .
COPY --from=assets /app/storage/compiled /app/storage/compiled
RUN mkdir -p storage/framework/cache storage/framework/logs storage/framework/public \
    && chown -R app:app storage/framework

USER app

EXPOSE 8000

# 0.0.0.0 is the container's own interface and has to be, or nothing outside
# the container can connect. Publish it to the host's loopback only and put
# nginx in front -- `docker run -p 127.0.0.1:8000:8000 ...` -- never -p 8000:8000.
# Processes, never threads: see the worker comment in lyn.sh.
CMD ["gunicorn", "wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", \
     "--access-logfile", "-", "--error-logfile", "-"]
