# syntax=docker/dockerfile:1

# The panel is deployed as a PanelAlpha Engine `dockerfile` app: the Engine
# builds this file with the **repository root** as the build context and routes
# the project's main domain to port 80. `prod` is the image it runs; `base` is
# the code-free runtime the dev `docker-compose.yml` and
# `backend/scripts/check-container-config.sh` keep building with the checkout
# mounted over /app.

# ---------------------------------------------------------------------------
# base – nginx + php-fpm 8.5 + supervisor, no application code.
# ---------------------------------------------------------------------------
FROM debian:trixie-slim AS base

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update -y \
    && apt-get install -y \
        wget \
        lsb-release \
        supervisor \
        curl \
        gnupg2 \
        zip \
    && wget -O /etc/apt/trusted.gpg.d/php.gpg https://packages.sury.org/php/apt.gpg \
    && echo "deb https://packages.sury.org/php/ $(lsb_release -sc) main" >/etc/apt/sources.list.d/php.list \
    && curl https://nginx.org/keys/nginx_signing.key | gpg --dearmor >/usr/share/keyrings/nginx-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] http://nginx.org/packages/debian $(lsb_release -cs) nginx" >/etc/apt/sources.list.d/nginx.list \
    && apt-get update -y \
    && apt-get install -y \
        php8.5-fpm \
        php8.5-curl \
        php8.5-mbstring \
        php8.5-xml \
        php8.5-zip \
        php8.5-sqlite3 \
        nginx \
    && apt-get clean autoclean \
    && apt-get autoremove -y

COPY --from=composer:2.10 /usr/bin/composer /usr/bin/composer

# Fallback only: entrypoint.sh rewrites both limits from the same
# USER_APPLICATION_UPLOAD_MAX_BYTES the SPA is told (client-area.upload_max_bytes),
# with post_max_size one MB above upload_max_filesize (multipart overhead).
RUN printf 'upload_max_filesize=256M\npost_max_size=257M\n' > /etc/php/8.5/fpm/conf.d/99-panelalpha.ini \
 && printf 'upload_max_filesize=256M\npost_max_size=257M\n' > /etc/php/8.5/cli/conf.d/99-panelalpha.ini

# nginx.org's package ships /etc/nginx/conf.d/default.conf with
# `server_name localhost`. src/config/nginx.conf includes conf.d/*.conf, and
# nginx prefers that exact name over our `server_name _` default_server, so a
# request with `Host: localhost` (the Engine's app-lite host proxy and health
# probe) hit the stock site and `/api/*` answered its 404 while `/` still
# worked. Remove it in the base stage so every derivative is clean.
RUN rm -f /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["bash", "/app/entrypoint.sh"]

# ---------------------------------------------------------------------------
# client-area – the Client Area SPA (Vue 3, Vite) with its native file manager.
#
# Built from the `src/frontend/client-area` submodule at the commit this branch
# points to. Nothing per-install is baked in: `src/shared/api/client.ts` falls
# back to `/api` and `src/shared/realtime/echo-client.ts` reads the websocket
# host and port from `window.location` (path `/ws`), so the image is
# host-independent. The Pusher key it hard-codes (`PUSHER_KEY`) is the
# REVERB_APP_KEY entrypoint.sh pins.
# ---------------------------------------------------------------------------
FROM node:24.21.0 AS client-area

WORKDIR /build/client-area
COPY src/frontend/client-area/ ./
# The Engine copies every `.env.example` in the checkout to `.env` before the
# build (`core/app/Lib/Deploy/Env/EnvExampleCopies.php:8-20`). This repo has:
#   src/backend/.env.example         -> `.dockerignore` keeps src/backend/.env out
# The Client Area ships only `.env.dev.example` (its dev server script), but
# Vite loads `.env`, `.env.local` and `.env.production*`, so any such file in
# the context would bake a `VITE_API_URL` (or a websocket host) into the bundle
# and route every login elsewhere. The build context's `.dockerignore` drops
# `**/.env` too; the cleanup below is this stage's own guard for a Dockerfile
# built elsewhere.
# >>> strip the Engine's .env copies >>>
RUN find . -name '.env*' ! -name '*.example' -type f -delete
# No build-time host and no Engine-copied `.env*` file may survive the cleanup
# above: a `VITE_*` host in the build environment or a `.env*` left behind
# would bake a host into the SPA.
RUN test -z "$(find . -name '.env*' ! -name '*.example' -type f -print -quit)" \
    && test -z "${VITE_API_URL:-}" \
    && test -z "${VITE_WEBSOCKET_HOST:-}" \
    && test -z "${VITE_WEBSOCKET_PORT:-}" \
    && test -z "${VITE_WEBSOCKET_PATH:-}" \
    && test -z "${VITE_WEBSOCKET_AUTH_ENDPOINT:-}"
# <<< strip the Engine's .env copies <<<
# `build-only`: the repository's own CI gates type-check, lint and tests.
RUN npm ci --no-audit --no-fund \
    && npm run build-only

# ---------------------------------------------------------------------------
# backend-deps – `src/backend` with `src/packages` as Composer path packages.
#
# The repository root context means the paths stay relative to the root, so
# the path-repository symlinks (`vendor/panelalpha/* -> ../../packages/*`)
# resolve in the `prod` stage, which keeps the same `/app/backend` +
# `/app/packages` layout.
# ---------------------------------------------------------------------------
FROM composer:2 AS backend-deps

WORKDIR /build
COPY src/backend/ ./src/backend/
COPY src/packages/ ./src/packages/
# bootstrap/cache is excluded from the build context, so recreate it: Laravel's
# post-autoload-dump runs `package:discover`, which writes the manifest there.
# The image keeps only the packages Composer installed: any other directory a
# checkout holds under src/packages never reaches it.
RUN mkdir -p src/backend/bootstrap/cache \
    && cd src/backend \
    && composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader \
    && for package in ../packages/*/; do \
        name="$(basename "$package")"; \
        [ -e "vendor/panelalpha/$name" ] || rm -rf "$package"; \
    done

# ---------------------------------------------------------------------------
# runtime – the base with the configuration, the entrypoint and the Client
# Area bundle: everything the image carries but the backend.
# ---------------------------------------------------------------------------
FROM base AS runtime

COPY src/config /app/config
COPY src/entrypoint.sh /app/entrypoint.sh
COPY --from=client-area /build/client-area/dist /app/frontend/dist
RUN chmod +x /app/entrypoint.sh

# State lives only in `/app/data` (SQLite database, storage, persisted APP_KEY);
# the image carries the code. `container_name` in the app config's compose
# override keeps one copy at a time.
VOLUME ["/app/data"]

# ---------------------------------------------------------------------------
# prod – the self-contained image the Engine builds and runs.
# ---------------------------------------------------------------------------
FROM runtime AS prod

# The product at runtime: entrypoint.sh renders it into backend/.env (php-fpm
# clears its environment).
ENV PANELALPHA_PRODUCT=community

COPY --from=backend-deps /build/src/backend /app/backend
COPY --from=backend-deps /build/src/packages /app/packages
