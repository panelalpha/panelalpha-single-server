#!/usr/bin/env bash
#
# Prove the production `prod` target of `Dockerfile` in a real
# image, the way the PanelAlpha Engine runs it: the build context is the
# repository root, the application code is baked in, and the only mount is a
# volume on `/app/data`. The check:
#   - assembles a clean context from HEAD plus the `src/frontend/client-area`
#     submodule contents (a worktree has empty submodules);
#   - builds the `prod` target (NOT `base`, which check-container-config.sh
#     proves with the checkout mounted);
#   - runs the image with just a volume on /app/data and proves `/api/home`
#     200, the built Client Area `index.html` on `/`, and every `queue:work`
#     supervisord program RUNNING;
#   - restarts the container on the same volume and proves APP_KEY and the
#     SQLite database survived.
#
# It needs Docker and curl. The image, container and volume names are unique
# per run (the image tag defaults to `panelalpha-v1-prod-check-<pid>`, override
# with PANELALPHA_PROD_IMAGE) so parallel gates cannot build over or run each
# other's copy. The context is a temp dir and
# the data lives on a named volume, so nothing is written into the checkout -
# in particular src/backend/.env is never created.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
IMAGE="${PANELALPHA_PROD_IMAGE:-panelalpha-v1-prod-check-$$}"
CONTAINER="${PANELALPHA_PROD_CONTAINER:-panelalpha-v1-prod-check-$$}"
VOLUME="${PANELALPHA_PROD_VOLUME:-panelalpha-v1-prod-data-$$}"

# A non-localhost SPA origin: with the runtime configuration coming only from
# these env vars, the CA login only reaches the stateful API when Sanctum sees
# this host. The credentials create the single Community user on the
# fresh volume.
PANEL_HOST="panel-$$.example.test"
PANEL_EMAIL="panel-$$@example.test"
PANEL_PASSWORD="Panel-Prod-Check-1!"

for tool in docker curl; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "check-container-prod: $tool is not available" >&2
        exit 1
    fi
done

# The `src/frontend/client-area` submodule (frontend/client-area) is empty in a
# worktree. Use the main checkout's copy (overridable) - never the worktree's
# gitlink.
client_area_src="${PANELALPHA_CLIENT_AREA_SRC:-}"
for candidate in "$client_area_src" \
    "$REPO_ROOT/src/frontend/client-area" \
    "/home/miodek/projects/panelalpha-app-lite/app/frontend/client-area"; do
    if [[ -n "$candidate" && -f "$candidate/package.json" ]]; then
        client_area_src="$candidate"
        break
    fi
    client_area_src=""
done
if [[ -z "$client_area_src" ]]; then
    echo "check-container-prod: set PANELALPHA_CLIENT_AREA_SRC to a frontend/client-area checkout (the worktree submodule is empty)" >&2
    exit 1
fi

CTX="${PANELALPHA_PROD_CONTEXT:-}"
TMP_CTX=""
if [[ -z "$CTX" ]]; then
    TMP_CTX="$(mktemp -d)"
    CTX="$TMP_CTX"
    # Copy without what the build never uses: agent worktrees under .claude can
    # hold gigabytes of vendors, and /tmp is a tmpfs.
    # The SPA submodules under src/frontend are copied below from their checkouts.
    tar -C "$REPO_ROOT" --exclude=./.claude --exclude=./.git --exclude=./packages/api --exclude=./packages/client-area --exclude='./src/frontend/*' \
        --exclude='./src/backend/vendor' --exclude='./src/backend/vendor-*' -cf - . | tar -C "$CTX" -xf -
    rm -rf "$CTX/.git" "$CTX/packages/api" "$CTX/src/backend/vendor" "$CTX/src/backend/.env" "$CTX/src/data"
    rm -rf "$CTX/packages/client-area" "$CTX/src/frontend"
    mkdir -p "$CTX/src/frontend/client-area"
    tar -C "$client_area_src" --exclude=./.git --exclude=./node_modules --exclude=./dist -cf - . \
        | tar -C "$CTX/src/frontend/client-area" -xf -
fi

# The Engine copies every `.env.example` in the checkout to `.env` before the
# build (`core/app/Lib/Deploy/Env/EnvExampleCopies.php:8-20`). A stale legacy
# `packages/client-area/.env` (`VUE_APP_API_URL=https://api.devpalpha.com/api`)
# was once loaded by the bundler and baked into the bundle, so every login hit
# the old dev API. panelalpha-frontend ships no `.env.example`,
# so plant the files Vite would load: the `.dockerignore` and the client-area
# stage's cleanup must both keep them out of the image.
client_api_value="https://api.devpalpha.com/api"
printf 'VITE_API_URL=%s\n' "$client_api_value" > "$CTX/src/frontend/client-area/.env"
printf 'VITE_WEBSOCKET_HOST=devpalpha.com\n' > "$CTX/src/frontend/client-area/.env.production"

cid=""
cleanup() {
    if [[ -n "$cid" ]]; then
        docker rm -f "$cid" >/dev/null 2>&1 || true
    fi
    if [[ -n "${s7_cid:-}" ]]; then
        docker rm -f "$s7_cid" >/dev/null 2>&1 || true
    fi
    docker volume rm -f "$VOLUME" >/dev/null 2>&1 || true
    if [[ -n "${S7_VOLUME:-}" ]]; then
        docker volume rm -f "$S7_VOLUME" >/dev/null 2>&1 || true
    fi
    docker image rm -f "$IMAGE" >/dev/null 2>&1 || true
    if [[ -n "$TMP_CTX" ]]; then
        rm -rf "$TMP_CTX"
    fi
}
trap cleanup EXIT

echo "check-container-prod: building $IMAGE ($([[ -n "$TMP_CTX" ]] && echo 'assembled context' || echo "$CTX"))"
# The Engine reads the app config and the build-context ignore from the
# repository root.
for entry in .panelalpha/panelalpha.yaml .dockerignore; do
    if [[ ! -f "$REPO_ROOT/$entry" ]]; then
        echo "check-container-prod: $entry is missing at the repository root" >&2
        exit 1
    fi
done
docker build --target prod -f "$CTX/Dockerfile" -t "$IMAGE" "$CTX"

docker volume create "$VOLUME" >/dev/null

start_container() {
    cid="$(docker run -d --name "$CONTAINER" \
        -e APP_ENV=production \
        -e APP_DEBUG=0 \
        -e APP_URL="http://$PANEL_HOST" \
        -e SESSION_DRIVER=database \
        -e SESSION_SAME_SITE=lax \
        -e SANCTUM_PREFIX=api \
        -e SANCTUM_STATEFUL_DOMAINS="$PANEL_HOST" \
        -e QUEUE_CONNECTION=database \
        -e CACHE_STORE=database \
        -e BROADCAST_CONNECTION=reverb \
        -e LOG_CHANNEL=stack \
        -e LOG_STACK=stderr,daily \
        -e PANELALPHA_USER_EMAIL="$PANEL_EMAIL" \
        -e PANELALPHA_USER_PASSWORD="$PANEL_PASSWORD" \
        -v "$VOLUME":/app/data \
        "$IMAGE")"
}

container_ip() {
    # $1 container id/name; defaults to the main container.
    docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "${1:-$cid}"
}

status_code() {
    # $1 path; remaining args: extra curl arguments
    local path="$1"
    shift
    curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" "http://$(container_ip)${path}"
}

# Print `secure` when the response's session cookie carries the Secure flag,
# `insecure` otherwise. Reads the headers on stdin so the check
# can be tested against a fixture.
panelalpha_cookie_is_secure() {
    if grep -qiE '^set-cookie: .*session=.*;[[:space:]]*secure' ; then
        echo secure
    else
        echo insecure
    fi
}

# Both the session and the XSRF-TOKEN cookie must be Secure under
# the env-only https configuration. Reads the response headers on stdin.
panelalpha_cookies_are_secure() {
    local headers
    headers="$(cat)"
    grep -qiE '^set-cookie: .*session=.*;[[:space:]]*secure' <<<"$headers" \
        && grep -qiE '^set-cookie: .*XSRF-TOKEN=.*;[[:space:]]*secure' <<<"$headers"
}

wait_for_home() {
    local code
    for _ in $(seq 1 120); do
        if [[ "$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || echo false)" != "true" ]]; then
            echo "check-container-prod: the container exited before it was ready" >&2
            docker logs "$cid" >&2 || true
            exit 1
        fi
        code="$(status_code /api/home || true)"
        if [[ "$code" == "200" ]]; then
            return 0
        fi
        sleep 2
    done

    echo "check-container-prod: /api/home did not return 200" >&2
    docker logs "$cid" >&2 || true
    exit 1
}

start_container
wait_for_home

# --- no stock nginx site may hijack `Host: localhost`. The
# base stage removes nginx.org's /etc/nginx/conf.d/default.conf (server_name
# localhost); `include conf.d/*.conf` loaded it and nginx picked the exact name
# before our `server_name _` default_server, so `Host: localhost` /api/* hit
# nginx's 404 while `/` still worked. The default server must answer the app.
localhost_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    -H 'Host: localhost' "http://$(container_ip)/api/home")"
if [[ "$localhost_code" != "200" ]]; then
    echo "check-container-prod: Host: localhost /api/home answered ${localhost_code} - a stock nginx site hijacks it" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
echo "check-container-prod: Host: localhost /api/home answers 200 (no stock nginx site)"


# The Client Area SPA is served on /.
index="$(curl -s --max-time 10 "http://$(container_ip)/")"
if ! grep -qi '<div id="app">\|<!doctype html>' <<<"$index"; then
    echo "check-container-prod: / did not serve the built Client Area index.html" >&2
    echo "$index" | head -c 400 >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
echo "check-container-prod: / served the built Client Area index.html"

# nginx prefers an `index-seo.html` where the image provides one; this image
# has none, so `/`, every history route and the name itself answer exactly the
# dist `index.html`.
if docker exec "$cid" test -L /app/frontend/dist/index-seo.html \
    || docker exec "$cid" test -e /app/frontend/dist/index-seo.html; then
    echo "check-container-prod: the image carries /app/frontend/dist/index-seo.html" >&2
    exit 1
fi
dist_index="$(docker exec "$cid" cat /app/frontend/dist/index.html)"
for path in / /dashboard /index-seo.html; do
    served="$(curl -s --max-time 10 "http://$(container_ip)${path}")"
    if [[ "$served" != "$dist_index" ]]; then
        echo "check-container-prod: ${path} did not serve the dist index.html (the image has no SEO index)" >&2
        echo "$served" | head -c 400 >&2
        exit 1
    fi
done
echo "check-container-prod: without an SEO index /, a history route and /index-seo.html serve the dist index.html"

# The planted `.env` files must never reach the bundle: the
# `.dockerignore` drops `**/.env` and the client-area stage strips `.env*`, so
# `src/shared/api/client.ts` keeps its same-origin `/api` fallback and the SPA
# never calls the old dev API. Vite emits the bundle under `dist/assets`; the
# check scans the whole dist so a changed layout cannot make it pass vacuously.
if ! docker exec "$cid" test -d /app/frontend/dist/assets; then
    echo "check-container-prod: /app/frontend/dist/assets is missing - the Client Area bundle was not built" >&2
    exit 1
fi
if docker exec "$cid" grep -rqF 'devpalpha' /app/frontend/dist; then
    echo "check-container-prod: the built Client Area bundle contains devpalpha - the Engine's .env copy reached the build" >&2
    docker exec "$cid" grep -rlF 'devpalpha' /app/frontend/dist >&2 || true
    docker logs "$cid" >&2 || true
    exit 1
fi
if docker exec "$cid" grep -rqF "$client_api_value" /app/frontend/dist; then
    echo "check-container-prod: the built Client Area bundle contains the absolute VITE_API_URL value" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
echo "check-container-prod: the bundle carries no devpalpha / absolute VITE_API_URL value"

# Every supervisord program that runs `queue:work` must be RUNNING (same rule
# as check-container-config.sh).
queue_programs="$(awk '
    BEGIN { RS = ""; FS = "\n" }
    {
        name = ""
        queue = 0
        for (i = 1; i <= NF; i++) {
            if ($i ~ /^\[program:/) { name = $i; gsub(/^\[program:|]$/, "", name) }
            if ($i ~ /queue:work/) { queue = 1 }
        }
        if (queue && name != "") print name
    }
' "$REPO_ROOT/src/config/supervisord.conf")"
if [[ -z "$queue_programs" ]]; then
    echo "check-container-prod: no queue:work program found in supervisord.conf" >&2
    exit 1
fi
sleep 5
status="$(docker exec "$cid" supervisorctl -c /app/config/supervisord.conf status)"
for program in $queue_programs; do
    if ! grep -E "^${program}[[:space:]]" <<<"$status" | grep -q RUNNING; then
        echo "check-container-prod: $program is not RUNNING" >&2
        echo "$status" >&2
        docker logs "$cid" >&2 || true
        exit 1
    fi
done
echo "check-container-prod: every queue:work program is RUNNING"

# --- the full CA login with the runtime configuration taken only
# from the container environment ---
# The Engine injects APP_URL/SANCTUM_*/SESSION_* as container env; php-fpm runs
# with `clear_env = yes`, so the entrypoint must have rendered them into
# backend/.env or the login answers 500. The CA sends the SPA Origin
# and returns the XSRF-TOKEN cookie value URL-decoded in `X-XSRF-TOKEN`
# (packages/client-area/src/apis/Api.js:14-15 with withXSRFToken).
login_jar="$(mktemp)"
csrf_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -c "$login_jar" \
    -H "Host: $PANEL_HOST" -H "Origin: http://$PANEL_HOST" \
    "http://$(container_ip)/api/csrf-cookie")"
if [[ "$csrf_code" != "204" && "$csrf_code" != "200" ]]; then
    echo "check-container-prod: /api/csrf-cookie answered ${csrf_code}" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
xsrf="$(awk '$6 == "XSRF-TOKEN" {print $7}' "$login_jar" | tail -1)"
xsrf_decoded="$(printf '%b' "${xsrf//%/\\x}")"
login_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -c "$login_jar" -b "$login_jar" \
    -H "Host: $PANEL_HOST" -H "Origin: http://$PANEL_HOST" \
    -H "X-XSRF-TOKEN: $xsrf_decoded" \
    -H 'Content-Type: application/json' -H 'Accept: application/json' \
    --data "{\"email\":\"$PANEL_EMAIL\",\"password\":\"$PANEL_PASSWORD\",\"remember\":true}" \
    "http://$(container_ip)/api/login")"
if [[ "$login_code" != "200" ]]; then
    echo "check-container-prod: POST /api/login answered ${login_code} - the CA cannot log in with env-only configuration" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
projects_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -c "$login_jar" -b "$login_jar" \
    -H "Host: $PANEL_HOST" -H "Origin: http://$PANEL_HOST" -H 'Accept: application/json' \
    "http://$(container_ip)/api/projects")"
# The Engine is not configured in this check (no fake Engine), so the list
# answers 200 from the mirror or the documented Engine-down 503; a 401 would
# mean php-fpm did not see the session.
if [[ "$projects_code" != "200" && "$projects_code" != "503" ]]; then
    echo "check-container-prod: GET /api/projects answered ${projects_code} after the login (expected 200 or the Engine-down 503)" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
echo "check-container-prod: full CA login (/api/csrf-cookie -> POST /api/login -> GET /api/projects ${projects_code}) with env-only configuration"

# --- a FRESH volume must seed the Engine credentials and
# the single user from the PANELALPHA_ENGINE_*/PANELALPHA_USER_* env vars only.
# The old `$(settings:get … 2>/dev/null || true)` captured the command's
# `Setting not found: …` stdout as if it were the value and skipped the seed,
# so a fresh install booted with "Engine connection is not configured". A
# separate container on its own volume keeps the web-request error block below (which needs an
# unconfigured Engine) intact.
S7_CONTAINER="${CONTAINER}-s7"
S7_VOLUME="${VOLUME}-s7"
S7_ENGINE_URL="http://127.0.0.1:9996/api"
S7_ENGINE_TOKEN="prodcheck-engine-token-$$"
docker volume create "$S7_VOLUME" >/dev/null
s7_cid="$(docker run -d --name "$S7_CONTAINER" \
    -e APP_ENV=production \
    -e APP_DEBUG=0 \
    -e APP_URL="http://$PANEL_HOST" \
    -e SESSION_DRIVER=database \
    -e SESSION_SAME_SITE=lax \
    -e SANCTUM_PREFIX=api \
    -e SANCTUM_STATEFUL_DOMAINS="$PANEL_HOST" \
    -e QUEUE_CONNECTION=database \
    -e CACHE_STORE=database \
    -e BROADCAST_CONNECTION=reverb \
    -e LOG_CHANNEL=stack \
    -e LOG_STACK=stderr,daily \
    -e PANELALPHA_ENGINE_URL="$S7_ENGINE_URL" \
    -e PANELALPHA_ENGINE_TOKEN="$S7_ENGINE_TOKEN" \
    -e PANELALPHA_USER_EMAIL="$PANEL_EMAIL" \
    -e PANELALPHA_USER_PASSWORD="$PANEL_PASSWORD" \
    -v "$S7_VOLUME":/app/data \
    "$IMAGE")"
s7_ready=0
for _ in $(seq 1 120); do
    if [[ "$(docker inspect -f '{{.State.Running}}' "$s7_cid" 2>/dev/null || echo false)" != "true" ]]; then
        echo "check-container-prod: the fresh-volume container exited before it was ready" >&2
        docker logs "$s7_cid" >&2 || true
        exit 1
    fi
    if [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://$(container_ip "$s7_cid")/api/home" || true)" == "200" ]]; then
        s7_ready=1
        break
    fi
    sleep 2
done
if [[ "$s7_ready" != "1" ]]; then
    echo "check-container-prod: the fresh-volume container's /api/home did not return 200" >&2
    docker logs "$s7_cid" >&2 || true
    exit 1
fi
s7_logs="$(docker logs "$s7_cid" 2>&1 || true)"
for s7_line in '[bootstrap] engine-api-url updated from PANELALPHA_ENGINE_URL' '[bootstrap] engine-api-token updated from PANELALPHA_ENGINE_TOKEN' '[bootstrap] first user created'; do
    if ! grep -qF "$s7_line" <<<"$s7_logs"; then
        echo "check-container-prod: the fresh-volume boot did not log: $s7_line" >&2
        printf '%s\n' "$s7_logs" >&2
        exit 1
    fi
done
if grep -qF "$S7_ENGINE_TOKEN" <<<"$s7_logs"; then
    echo "check-container-prod: the fresh-volume boot logged the Engine token" >&2
    exit 1
fi
# Log in with exactly the env credentials, then read the seeded Engine URL back
# through the authenticated /api/home payload (`app.mcp_url` is derived from
# `engine-api-url`'s origin; an unseeded URL leaves it null). This creates no
# user another way: the boot's seeding is the only user-creation path.
s7_ip="$(container_ip "$s7_cid")"
s7_jar="$(mktemp)"
curl -s -o /dev/null --max-time 10 -c "$s7_jar" \
    -H "Host: $PANEL_HOST" -H "Origin: http://$PANEL_HOST" \
    "http://$s7_ip/api/csrf-cookie"
s7_xsrf="$(awk '$6 == "XSRF-TOKEN" {print $7}' "$s7_jar" | tail -1)"
s7_xsrf_decoded="$(printf '%b' "${s7_xsrf//%/\\x}")"
s7_login_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -c "$s7_jar" -b "$s7_jar" \
    -H "Host: $PANEL_HOST" -H "Origin: http://$PANEL_HOST" \
    -H "X-XSRF-TOKEN: $s7_xsrf_decoded" \
    -H 'Content-Type: application/json' -H 'Accept: application/json' \
    --data "{\"email\":\"$PANEL_EMAIL\",\"password\":\"$PANEL_PASSWORD\"}" \
    "http://$s7_ip/api/login")"
if [[ "$s7_login_code" != "200" ]]; then
    echo "check-container-prod: the fresh-volume boot's user login answered $s7_login_code" >&2
    docker logs "$s7_cid" >&2 || true
    exit 1
fi
s7_home="$(curl -s --max-time 10 -c "$s7_jar" -b "$s7_jar" \
    -H "Host: $PANEL_HOST" -H "Origin: http://$PANEL_HOST" -H 'Accept: application/json' \
    "http://$s7_ip/api/home")"
rm -f "$s7_jar"
s7_mcp="$(grep -o '"mcp_url":"[^"]*"' <<<"$s7_home" | head -1)"
if [[ "$s7_mcp" != *"127.0.0.1:9996"* || "$s7_mcp" != *"/mcp"* ]]; then
    echo "check-container-prod: /api/home did not carry the seeded Engine URL (${s7_mcp:-no mcp_url}): $(head -c 300 <<<"$s7_home")" >&2
    docker logs "$s7_cid" >&2 || true
    exit 1
fi
docker rm -f "$s7_cid" >/dev/null 2>&1 || true
docker volume rm -f "$S7_VOLUME" >/dev/null 2>&1 || true
echo "check-container-prod: a fresh volume seeded the Engine URL/token and the first user; login with the env credentials sees the seeded Engine URL"

# --- a web-request error reaches docker logs and the daily file ---
# GET /api/mcp-tokens reaches the Engine resolver with no Engine configured and
# answers the unhandled EngineNotConfiguredException (503), which Laravel logs
# at ERROR. The FPM worker output used to be discarded and the log channel
# was stderr-only; the generated catch_workers_output + stderr error_log and the
# stack channel (stderr + daily) must both carry this line.
error_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -c "$login_jar" -b "$login_jar" \
    -H "Host: $PANEL_HOST" -H "Origin: http://$PANEL_HOST" -H 'Accept: application/json' \
    "http://$(container_ip)/api/mcp-tokens")"
if [[ "$error_code" != "503" ]]; then
    echo "check-container-prod: GET /api/mcp-tokens answered ${error_code}, expected the Engine-not-configured 503" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
log_marker='is not configured'
log_found=0
file_found=0
for _ in $(seq 1 20); do
    container_logs="$(docker logs "$cid" 2>&1 || true)"
    if grep -qF "$log_marker" <<<"$container_logs"; then log_found=1; fi
    if docker exec "$cid" grep -rqF "$log_marker" /app/data/laravel/logs; then file_found=1; fi
    if [[ "$log_found" == "1" && "$file_found" == "1" ]]; then
        break
    fi
    sleep 1
done
if [[ "$log_found" != "1" ]]; then
    echo "check-container-prod: the web-request error did not reach docker logs" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
if [[ "$file_found" != "1" ]]; then
    echo "check-container-prod: the web-request error did not reach /app/data/laravel/logs" >&2
    docker exec "$cid" sh -c 'ls -la /app/data/laravel/logs; tail -20 /app/data/laravel/logs/* 2>/dev/null' >&2 || true
    exit 1
fi
echo "check-container-prod: a web-request error reached docker logs and the daily file"

# --- a 250 MB archive upload through nginx and php-fpm ---
# The CA advertises 256 MB. The raw body is buffered to a seekable temp stream
# and streamed to the Engine, which needs a Content-Length for the non-seekable
# php://input. A fake Engine answers files/mkdir and files/upload and records the
# bytes it received; the 120 MB case once answered a bare 500. The upload first
# asks the Engine whether a deploy runs
# (GET /projects/{u}/deploys, DeployHistoryController::index): nothing is kept.
docker exec "$cid" bash -c 'cat > /tmp/fake-engine-upload.php <<"PHP"
<?php
$path = parse_url($_SERVER["REQUEST_URI"] ?? "/", PHP_URL_PATH) ?: "/";
if (preg_match("#/deploys$#", $path) === 1) {
    header("Content-Type: application/json");
    echo json_encode(["data" => []]);

    return true;
}
if (preg_match("#/files/upload$#", $path) === 1) {
    // The body is multipart/form-data, so php://input is empty; the built-in
    // server parses the part and PHP reports its size (upload_max_filesize is
    // the entrypoint-generated 256M in the CLI conf.d too).
    $size = 0;
    if (isset($_FILES["file"]) && is_array($_FILES["file"])) {
        $size = (int) ($_FILES["file"]["size"] ?? 0);
        $tmp = $_FILES["file"]["tmp_name"] ?? null;
        if ($size === 0 && is_string($tmp) && is_file($tmp)) {
            $size = (int) filesize($tmp);
        }
    }
    file_put_contents("/tmp/fake-upload-bytes.txt", (string) $size);
} elseif (preg_match("#/files/mkdir$#", $path) !== 1) {
    http_response_code(404);

    return true;
}
header("Content-Type: application/json");
echo json_encode(["data" => ["ok" => true]]);

return true;
PHP'
docker exec -d "$cid" php -S 127.0.0.1:9998 /tmp/fake-engine-upload.php >/dev/null 2>&1 || true
fake_ready=0
for _ in $(seq 1 30); do
    if docker exec "$cid" curl -fsS -o /dev/null -X POST -H 'Content-Type: application/json' --data '{}' http://127.0.0.1:9998/api/projects/prodcheck/files/mkdir 2>/dev/null; then
        fake_ready=1
        break
    fi
    sleep 1
done
if [[ "$fake_ready" != "1" ]]; then
    echo "check-container-prod: the fake Engine upload endpoint did not start" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
docker exec "$cid" php /app/backend/artisan settings:set engine-api-url http://127.0.0.1:9998/api >/dev/null
docker exec "$cid" php /app/backend/artisan settings:set engine-api-token prodcheck-token >/dev/null
app_id="$(docker exec "$cid" php -r '
chdir("/app/backend");
require "vendor/autoload.php";
$app = require "bootstrap/app.php";
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$user = App\Models\User::query()->first();
$application = PanelAlpha\ClientArea\Models\Application::query()->create([
    "engine_id" => 1,
    "engine_project_id" => 9001,
    "engine_username" => "prodcheck",
    "name" => "prodcheck",
    "domain" => "prodcheck.example.test",
    "status" => "active",
    "type" => "custom",
    "engine_payload" => ["details" => ["template" => "dind"]],
]);
echo $application->id;
' 2>/dev/null | tail -1 | tr -d '\r')"
if [[ -z "$app_id" ]]; then
    echo "check-container-prod: could not create the test application row for the upload probe" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
big="$(mktemp)"
truncate -s 262144000 "$big"
upload_body="$(mktemp)"
upload_xsrf="$(awk '$6 == "XSRF-TOKEN" {print $7}' "$login_jar" | tail -1)"
upload_xsrf_decoded="$(printf '%b' "${upload_xsrf//%/\\x}")"
upload_code="$(curl -s -o "$upload_body" -w '%{http_code}' --max-time 600 -c "$login_jar" -b "$login_jar" \
    -H "Host: $PANEL_HOST" -H "Origin: http://$PANEL_HOST" -H 'Accept: application/json' \
    -H "X-XSRF-TOKEN: $upload_xsrf_decoded" \
    -H 'Content-Type: application/octet-stream' \
    --data-binary "@$big" \
    "http://$(container_ip)/api/projects/$app_id/deploy/upload?filename=big.zip")"
rm -f "$big"
if [[ "$upload_code" != "200" ]]; then
    echo "check-container-prod: the 250 MB archive upload answered ${upload_code} (body: $(head -c 200 "$upload_body"))" >&2
    rm -f "$upload_body"
    docker logs "$cid" >&2 || true
    exit 1
fi
rm -f "$upload_body"
received="$(docker exec "$cid" cat /tmp/fake-upload-bytes.txt 2>/dev/null | tr -d '\r' || true)"
if [[ -z "$received" || "$received" -lt 262144000 ]]; then
    echo "check-container-prod: the fake Engine received ${received:-0} bytes for the 250 MB upload" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
echo "check-container-prod: a 250 MB archive uploaded through nginx/php-fpm to the Engine (${received} bytes)"
rm -f "$login_jar"

# --- the Secure session cookie behind the Engine proxy ---
# The Engine proxy terminates TLS and sends X-Forwarded-Proto. A request from
# an untrusted peer must not turn that into a Secure cookie; the same request
# from a trusted front proxy (the bridge subnet here, the app config's private
# ranges in production) must. nginx forwards X-Forwarded-Proto only after
# real_ip trusted the peer's X-Forwarded-For, and Laravel trusts the header only
# from the container nginx.
secure_cookie_state() {
    # $1 X-Forwarded-Proto value; $2 X-Forwarded-For value (optional)
    curl -sI --max-time 10 -H "Host: $PANEL_HOST" -H "Origin: http://$PANEL_HOST" \
        -H "X-Forwarded-Proto: $1" ${2:+-H "X-Forwarded-For: $2"} \
        "http://$(container_ip)/api/home" | tr -d '\r' | panelalpha_cookie_is_secure
}

untrusted_secure="$(secure_cookie_state https 198.51.100.9)"
if [[ "$untrusted_secure" != "insecure" ]]; then
    echo "check-container-prod: an untrusted X-Forwarded-Proto marked the session cookie Secure" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi

bridge_subnet="$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Subnet}}')"
if [[ -z "$bridge_subnet" ]]; then
    echo "check-container-prod: could not read the bridge subnet" >&2
    exit 1
fi
docker exec "$cid" bash -c "TRUSTED_FRONT_PROXIES='${bridge_subnet}' bash /app/backend/scripts/write-trusted-proxies.sh"
docker exec "$cid" nginx -s reload -c /app/config/nginx.conf
sleep 1
trusted_secure="$(secure_cookie_state https 203.0.113.77)"
if [[ "$trusted_secure" != "secure" ]]; then
    echo "check-container-prod: a trusted front proxy's X-Forwarded-Proto https did not mark the session cookie Secure" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
echo "check-container-prod: an untrusted X-Forwarded-Proto is ignored; a trusted front proxy's https marks the session cookie Secure"

# The database survives: a marker written before the restart is read back the
# same after it (a real row in the mounted SQLite file).
marker="prod-check-$(date +%s)-$$"
docker exec "$cid" php /app/backend/artisan settings:set prod-check-marker "$marker" >/dev/null
key_before="$(docker exec "$cid" grep -m1 '^APP_KEY=' /app/backend/.env || true)"
if [[ -z "$key_before" || "$key_before" == "APP_KEY=" ]]; then
    echo "check-container-prod: the container did not generate an APP_KEY" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi

# Restart on the same volume: APP_KEY and the database survive.
docker restart "$cid" >/dev/null
wait_for_home

key_after="$(docker exec "$cid" grep -m1 '^APP_KEY=' /app/backend/.env || true)"
if [[ "$key_after" != "$key_before" ]]; then
    echo "check-container-prod: APP_KEY changed across a restart" >&2
    exit 1
fi
db="$(docker exec "$cid" test -s /app/data/laravel/database/database.sqlite && echo present || echo missing)"
if [[ "$db" != "present" ]]; then
    echo "check-container-prod: the SQLite database did not survive the restart" >&2
    exit 1
fi
got="$(docker exec "$cid" php /app/backend/artisan settings:get prod-check-marker 2>/dev/null | tr -d '\r' || true)"
if [[ "$got" != "$marker" ]]; then
    echo "check-container-prod: the database row written before the restart was lost" >&2
    exit 1
fi

echo "check-container-prod: production image boots with only /app/data mounted; /api/home 200, CA index.html, workers RUNNING, APP_KEY and database survive a restart"

# --- env-only https configuration makes both cookies Secure ---
# The panel is served over https (APP_URL is the https PA_PUBLIC_URL) but the
# Engine's app-lite host proxy sends no X-Forwarded-Proto, so the request-scheme
# path cannot mark the cookies Secure. A fresh container on the same volume with
# only APP_URL=https://... and SESSION_SECURE_COOKIE=true (the app config) must
# serve both the session and the XSRF-TOKEN cookie with Secure, with no
# X-Forwarded-Proto on the request.
docker rm -f "$cid" >/dev/null 2>&1 || true
cid="$(docker run -d --name "$CONTAINER" \
    -e APP_ENV=production \
    -e APP_DEBUG=0 \
    -e APP_URL="https://$PANEL_HOST" \
    -e SESSION_DRIVER=database \
    -e SESSION_SAME_SITE=lax \
    -e SESSION_SECURE_COOKIE=true \
    -e SANCTUM_PREFIX=api \
    -e SANCTUM_STATEFUL_DOMAINS="$PANEL_HOST" \
    -e QUEUE_CONNECTION=database \
    -e CACHE_STORE=database \
    -e BROADCAST_CONNECTION=reverb \
    -e LOG_CHANNEL=stack \
    -e LOG_STACK=stderr,daily \
    -v "$VOLUME":/app/data \
    "$IMAGE")"
wait_for_home
h3_headers="$(curl -sI --max-time 10 -H "Host: $PANEL_HOST" -H "Origin: http://$PANEL_HOST" \
    "http://$(container_ip)/api/csrf-cookie" | tr -d '\r')"
if ! panelalpha_cookies_are_secure <<<"$h3_headers"; then
    echo "check-container-prod: APP_URL=https over http-with-no-forwarded-proto did not make both cookies Secure:" >&2
    printf '%s\n' "$h3_headers" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
echo "check-container-prod: SESSION_SECURE_COOKIE=true with an https APP_URL makes the session and XSRF-TOKEN cookies Secure"

# --- an over-limit upload answers JSON 413, not nginx HTML ---
# client_max_body_size is 257 MB (the CA advertises 256 MB). nginx refuses a
# bigger body before PHP; the front server must answer the CA's `{message}`
# shape instead of its HTML page. No session is needed: the body limit is
# enforced before the request is proxied.
big413="$(mktemp)"
truncate -s 314572800 "$big413"
body413_file="$(mktemp)"
code413="$(curl -s -o "$body413_file" -w '%{http_code}' --max-time 120 \
    -H "Host: $PANEL_HOST" -H 'Content-Type: application/octet-stream' \
    --data-binary "@$big413" \
    "http://$(container_ip)/api/projects/1/deploy/upload?filename=big.zip" || true)"
rm -f "$big413"
body413="$(cat "$body413_file" 2>/dev/null || true)"
rm -f "$body413_file"
if [[ "$code413" != "413" ]]; then
    echo "check-container-prod: the 300 MB upload answered ${code413}, expected 413 (body: $(head -c 120 <<<"$body413"))" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
if ! grep -q '"message"' <<<"$body413" || grep -qi '<html' <<<"$body413"; then
    echo "check-container-prod: the 413 was not the CA's JSON shape: $(head -c 200 <<<"$body413")" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
echo "check-container-prod: an over-limit /api upload answered a JSON 413 (${code413})"
