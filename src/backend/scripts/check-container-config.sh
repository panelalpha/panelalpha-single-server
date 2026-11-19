#!/usr/bin/env bash
#
# Prove the container's web and worker config in the **real** v1 image
#The PHP test image has no nginx/php-fpm, so
# LongCallTimeoutsTest's `php-fpm -t` / `nginx -t` checks skip there; this
# script builds the real image, runs the real entrypoint.sh config steps and
# then checks:
#   - `php-fpm8.5 -tt` accepts the generated pool config (a missing pool
#     user/group, `pm.max_children = 0` or an invalid `pm` stops php-fpm);
#   - `nginx -t` accepts config/nginx.conf including the generated snippets,
#     started with IPv6 disabled so the IPv4-only loopback bind is proven;
#   - every supervisord program whose command runs `queue:work` reaches RUNNING
#     with a settled uptime (>= 10 s) and an unchanged PID, so a worker that
#     starts and then crashes on its first job is caught.
#
# Run it from anywhere; it needs Docker and curl (the client-IP probes use curl). The image is `panelalpha-v1-check:<Dockerfile hash>`
# (override with PANELALPHA_CHECK_IMAGE, force a rebuild with
# PANELALPHA_CHECK_BUILD=1). The container name is unique per run
# (`panelalpha-v1-check-$$`; override with PANELALPHA_CHECK_CONTAINER) so
# parallel gates do not kill each other. The backend is copied to a temp dir
# (vendor is mounted read-only) and the data lives on a tmpfs, so entrypoint.sh
# never writes into the checkout – in particular src/backend/.env is never
# created.
set -euo pipefail

V1_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="${PANELALPHA_CHECK_CONTAINER:-panelalpha-v1-check-$$}"
APP_KEY="base64:MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="

for tool in docker curl; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "check-container-config: $tool is not available" >&2
        exit 1
    fi
done

# The cached image is tagged by the Dockerfile's hash (the code-free `base` target copies no files), so a build
# from another worktree or an older checkout is never reused for this one: a stale shared tag once hid a fix
# (php8.5-mbstring) from the extension check.
IMAGE="${PANELALPHA_CHECK_IMAGE:-panelalpha-v1-check:$(sha256sum "$V1_ROOT/../Dockerfile" | cut -c1-12)}"
if [[ "${PANELALPHA_CHECK_BUILD:-0}" == "1" ]] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    echo "check-container-config: building $IMAGE from $V1_ROOT"
    # The dev image mounts the checkout over /app, so only the code-free `base`
    # target is built (the production target lives in
    # check-container-prod.sh).
    # The Dockerfile sits at the repository root; `base` copies nothing, so src/ stays the context.
    docker build --target base -f "$V1_ROOT/../Dockerfile" -t "$IMAGE" "$V1_ROOT"
fi

TMP_BACKEND="$(mktemp -d)"
cid=""
cleanup() {
    if [[ -n "$cid" ]]; then
        docker rm -f "$cid" >/dev/null 2>&1 || true
    fi
    rm -rf "$TMP_BACKEND"
}
trap cleanup EXIT

# A copy of the backend without vendor (mounted read-only) so entrypoint.sh's
# .env and bootstrap cache writes go to the temp dir, never the checkout.
tar -C "$V1_ROOT/backend" --exclude='./vendor' --exclude='./vendor-*' -cf - . | tar -C "$TMP_BACKEND" -xf -

# A fake Engine for the MCP streaming proof: system/info points
# the panel at `/mcp` and the SSE body sends the first event immediately, waits,
# then sends the second. The proof asserts the first reaches the client before
# the second is produced, i.e. PHP's output buffer was really flushed.
cat > "$TMP_BACKEND/fake-engine.php" <<'PHP'
<?php

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

while (ob_get_level() > 0) {
    ob_end_clean();
}

if ($path === '/api/system/info') {
    header('Content-Type: application/json');
    echo json_encode(['data' => ['mcp_url' => 'http://127.0.0.1:9999/mcp']]);

    return true;
}

if ($path === '/mcp' || $path === '/mcp/check') {
    // `/mcp/check` answers immediately: the MCP check below drives it 60+
    // times through the rate limiter, so it must not sleep like the stream.
    if ($path === '/mcp/check') {
        header('Content-Type: application/json');
        echo json_encode(['valid' => true]);

        return true;
    }

    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    echo "data: first-event\n\n";
    flush();
    sleep(2);
    echo "data: second-event\n\n";
    flush();

    return true;
}

http_response_code(404);

return true;
PHP

# The /mcp gatekeeper forwards only a token the panel minted for a user, so the
# probes carry one: Engine token id 1, recorded for a probe user.
cat > "$TMP_BACKEND/seed-mcp-token.php" <<'PHP'
<?php

require '/app/backend/vendor/autoload.php';
$app = require '/app/backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$userId = Illuminate\Support\Facades\DB::table('users')->where('email', $argv[1])->value('id');
Illuminate\Support\Facades\DB::table('mcp_tokens')->insert([
    'user_id' => $userId,
    'engine_id' => 1,
    'engine_token_id' => (int) $argv[2],
    'name' => 'probe',
    'created_at' => now(),
    'updated_at' => now(),
]);
PHP

cat > "$TMP_BACKEND/probe-mcp-stream.sh" <<'SH'
#!/bin/bash
start=$(date +%s%N)
curl -sSN --max-time 15 \
    -X POST \
    -H "Authorization: Bearer 1|probe-secret" \
    -H "Accept: application/json, text/event-stream" \
    -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
    http://127.0.0.1/mcp | while IFS= read -r line; do
        [ -z "$line" ] && continue
        printf '%s %s\n' "$(( ($(date +%s%N)-start)/1000000 ))" "$line"
done
SH

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

# /app/data is a tmpfs: entrypoint runs migrations and chowns it as root, and
# nothing is left on the host. IPv6 is disabled so nginx must
# start and serve with only the IPv4 loopback bind - a `listen [::1]:82` would
# fail `bind()` here and the container would exit before any probe.
cid="$(docker run -d --name "$CONTAINER" \
    --sysctl net.ipv6.conf.all.disable_ipv6=1 \
    -e APP_KEY="$APP_KEY" \
    -v "$V1_ROOT/entrypoint.sh":/app/entrypoint.sh:ro \
    -v "$V1_ROOT/config":/app/config:ro \
    -v "$V1_ROOT/packages":/app/packages:ro \
    -v "$TMP_BACKEND":/app/backend \
    -v "$V1_ROOT/backend/vendor":/app/backend/vendor:ro \
    --tmpfs /app/data \
    "$IMAGE" bash /app/entrypoint.sh)"

ready=0
for _ in $(seq 1 90); do
    if [[ "$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || echo false)" != "true" ]]; then
        echo "check-container-config: the container exited before supervisord was ready" >&2
        docker logs "$cid" >&2 || true
        exit 1
    fi
    if docker exec "$cid" supervisorctl -c /app/config/supervisord.conf status >/dev/null 2>&1; then
        ready=1
        break
    fi
    sleep 2
done
if [[ "$ready" != "1" ]]; then
    echo "check-container-config: supervisord did not come up" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi

# php-fpm and nginx must accept the generated config.
docker exec "$cid" php-fpm8.5 -tt

# Every PHP extension the locked dependencies require must be loaded in the image, for the CLI (artisan, the
# queue workers, the scheduler) and php-fpm (web requests). The Composer stage installs with the composer:2 image,
# which has them all, so a missing runtime package only fails at run time: php8.5-mbstring was missing and every
# mb_* call (Str helpers, the project-list search, artisan's table output) died with "undefined function".
required_exts="$(docker exec "$cid" php -r '
    $lock = json_decode((string) file_get_contents("/app/backend/composer.lock"), true);
    $exts = [];
    foreach ([...($lock["packages"] ?? []), ...($lock["packages-dev"] ?? [])] as $package) {
        foreach (array_keys($package["require"] ?? []) as $name) {
            if (str_starts_with($name, "ext-")) { $exts[strtolower(substr($name, 4))] = true; }
        }
    }
    ksort($exts);
    echo implode(" ", array_keys($exts));
')"
cli_mods="$(docker exec "$cid" php -m | tr '[:upper:]' '[:lower:]')"
fpm_mods="$(docker exec "$cid" php-fpm8.5 -m | tr '[:upper:]' '[:lower:]')"
missing=""
for ext in $required_exts; do
    grep -qx "$ext" <<<"$cli_mods" || missing="$missing cli:$ext"
    grep -qx "$ext" <<<"$fpm_mods" || missing="$missing fpm:$ext"
done
if [[ -z "$required_exts" || -n "$missing" ]]; then
    echo "check-container-config: PHP extensions required by composer.lock are not loaded:${missing:- (none read from composer.lock)}" >&2
    exit 1
fi
echo "check-container-config: every PHP extension composer.lock requires is loaded for the CLI and php-fpm ($required_exts)"
docker exec "$cid" nginx -t -c /app/config/nginx.conf

# `php-fpm -tt` accepts a pool without listen.owner/listen.group, but then the
# [long] socket stays root:root and nginx (www-data) gets EACCES -> 502 on the
# long write routes. Assert the socket owner the generated pool declares
#Poll for the socket: supervisord is ready before php-fpm has
# necessarily created it.
long_socket="/var/run/php/php8.5-fpm-long.sock"
socket_owner=""
for _ in $(seq 1 10); do
    socket_owner="$(docker exec "$cid" stat -c '%U:%G' "$long_socket" 2>/dev/null || true)"
    [[ -n "$socket_owner" ]] && break
    sleep 1
done
if [[ "$socket_owner" != "www-data:www-data" ]]; then
    echo "check-container-config: the [long] socket is ${socket_owner:-missing}, not www-data:www-data - nginx would 502 on the long routes" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi

status="$(docker exec "$cid" supervisorctl -c /app/config/supervisord.conf status)"
echo "$status"

# Every supervisord program that runs `queue:work` must reach RUNNING.
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
' "$V1_ROOT/config/supervisord.conf")"

if [[ -z "$queue_programs" ]]; then
    echo "check-container-config: no queue:work program found in supervisord.conf" >&2
    exit 1
fi

# `supervisorctl status` turns a program RUNNING as soon as it starts, so a
# worker that dies on its first job would still pass a single check. Wait until
# every queue program has been RUNNING for at least 10 s with the same PID
# across two consecutive polls.
clock_seconds() {
    local IFS=':'
    # shellcheck disable=SC2086
    set -- $1
    case $# in
        3) echo $(( 10#$1 * 3600 + 10#$2 * 60 + 10#$3 )) ;;
        2) echo $(( 10#$1 * 60 + 10#$2 )) ;;
        *) echo 0 ;;
    esac
}

uptime_seconds() {
    # `0:00:05` or `2 days, 3:04:05`.
    if [[ "$1" == *days,* ]]; then
        local days rest
        days="$(sed -nE 's/^([0-9]+) days?,.*/\1/p' <<<"$1")"
        rest="${1#*days, }"
        echo $(( days * 86400 + $(clock_seconds "$rest") ))
    else
        clock_seconds "$1"
    fi
}

settled_seconds="${PANELALPHA_CHECK_SETTLE_SECONDS:-10}"

# Print `<program>:<pid> ` for every queue program that is RUNNING with an
# uptime >= settled_seconds; print nothing and return 1 otherwise.
# Pure output of the supervisor status, so the check can be tested.
worker_pids() {
    local status="$1" program line pid uptime pids=""
    for program in $queue_programs; do
        line="$(grep -E "^${program}[[:space:]]" <<<"$status" || true)"
        [[ "$line" == *RUNNING* ]] || return 1
        pid="$(sed -nE 's/.*pid ([0-9]+).*/\1/p' <<<"$line")"
        uptime="$(sed -nE 's/.*uptime //p' <<<"$line" | sed -E 's/[[:space:]]+$//')"
        if [[ -z "$pid" || -z "$uptime" ]] || (( $(uptime_seconds "$uptime") < settled_seconds )); then
            return 1
        fi
        pids+="${program}:${pid} "
    done
    printf '%s' "$pids"
}

settled_workers() {
    local previous="" pids
    for _ in $(seq 1 60); do
        status="$(docker exec "$cid" supervisorctl -c /app/config/supervisord.conf status)" || return 1
        if ! pids="$(worker_pids "$status")"; then
            previous=""
            sleep 2

            continue
        fi
        if [[ -n "$previous" && "$pids" == "$previous" ]]; then
            return 0
        fi
        previous="$pids"
        sleep 2
    done

    return 1
}

if ! settled_workers; then
    echo "check-container-config: a queue:work program is not RUNNING with a settled uptime >= ${settled_seconds} s and a stable PID" >&2
    docker exec "$cid" supervisorctl -c /app/config/supervisord.conf status >&2 || true
    docker logs "$cid" >&2 || true
    exit 1
fi

# Print the settled status after the loop: the last polled
# state is the one that proved every queue worker stable with an unchanged PID.
echo "$status"

# --- MCP streaming proof ---
# Serve a fake Engine inside the real image, point the panel at it and assert
# that the first SSE event reaches the client before the Engine produces the
# second: with only `flush()` the frame sits in PHP-FPM's output buffer
# (`output_buffering`) and both events arrive together.
docker exec -d "$cid" php -S 127.0.0.1:9999 /app/backend/fake-engine.php >/dev/null 2>&1 || true
fakeready=0
for _ in $(seq 1 30); do
    if docker exec "$cid" curl -fsS http://127.0.0.1:9999/api/system/info >/dev/null 2>&1; then
        fakeready=1
        break
    fi
    sleep 1
done
if [[ "$fakeready" != "1" ]]; then
    echo "check-container-config: the fake Engine did not start" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi

docker exec "$cid" php /app/backend/artisan settings:set engine-api-url http://127.0.0.1:9999/api >/dev/null
docker exec "$cid" php /app/backend/artisan settings:set engine-api-token probe-token >/dev/null
docker exec "$cid" php /app/backend/artisan users:create mcp-probe@example.com 'Mcp-Probe-1!' >/dev/null
docker exec "$cid" php /app/backend/seed-mcp-token.php mcp-probe@example.com 1

probe="$(docker exec "$cid" bash /app/backend/probe-mcp-stream.sh 2>/dev/null || true)"
first_ms="$(awk '/first-event/ {print $1; exit}' <<<"$probe")"
second_ms="$(awk '/second-event/ {print $1; exit}' <<<"$probe")"
if [[ -z "$first_ms" || -z "$second_ms" ]]; then
    echo "check-container-config: the MCP stream did not deliver both SSE events" >&2
    echo "$probe" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
gap=$(( second_ms - first_ms ))
if (( gap < 1500 )); then
    echo "check-container-config: the MCP SSE stream was buffered (first event ${first_ms} ms, second ${second_ms} ms)" >&2
    echo "$probe" >&2
    exit 1
fi
echo "check-container-config: MCP SSE streamed the first event ${first_ms} ms, second ${second_ms} ms"

# The stream pool must own its socket so nginx
# (www-data) can pass /mcp to it, and the backend server must actually use it.
stream_socket="/var/run/php/php8.5-fpm-stream.sock"
stream_owner=""
for _ in $(seq 1 10); do
    stream_owner="$(docker exec "$cid" stat -c '%U:%G' "$stream_socket" 2>/dev/null || true)"
    [[ -n "$stream_owner" ]] && break
    sleep 1
done
if [[ "$stream_owner" != "www-data:www-data" ]]; then
    echo "check-container-config: the [stream] socket is ${stream_owner:-missing}, not www-data:www-data" >&2
    docker logs "$cid" >&2 || true
    exit 1
fi
if ! docker exec "$cid" grep -q 'php8.5-fpm-stream.sock' /app/config/nginx.conf; then
    echo "check-container-config: config/nginx.conf does not use the [stream] socket" >&2
    exit 1
fi

# `nginx -T` resolves every include, so the merged config must
# really carry the /mcp locations and the [stream] pass, not only the static
# nginx.conf text.
nginx_dump="$(docker exec "$cid" nginx -T -c /app/config/nginx.conf 2>/dev/null)"
for path in /mcp /mcp/check; do
    if ! grep -Pzq "location = ${path}[[:space:]]*\{[^}]*fastcgi_pass unix:/var/run/php/php8\\.5-fpm-stream\\.sock;" <<<"$nginx_dump"; then
        echo "check-container-config: nginx -T does not pass ${path} to the [stream] socket" >&2
        exit 1
    fi
done
echo "check-container-config: nginx -T carries the /mcp locations on the [stream] socket"

# While an MCP stream is open, a php-fpm worker of the dedicated
# [stream] pool must be the one handling it. php-fpm setproctitle names it
# `php-fpm: pool stream`, visible in /proc/<pid>/cmdline.
docker exec -d "$cid" bash /app/backend/probe-mcp-stream.sh >/dev/null 2>&1 || true
stream_worker=""
for _ in $(seq 1 40); do
    if docker exec "$cid" bash -c 'for f in /proc/[0-9]*/cmdline; do case "$(tr "\0" " " < "$f" 2>/dev/null)" in "php-fpm: pool stream "*) exit 0;; esac; done; exit 1' >/dev/null 2>&1; then
        stream_worker=1
        break
    fi
    sleep 0.2
done
if [[ -z "$stream_worker" ]]; then
    echo "check-container-config: no [stream] php-fpm worker was seen while an MCP stream was open" >&2
    exit 1
fi
echo "check-container-config: the open MCP stream ran on the [stream] php-fpm pool"

# The generated config never rewrites the package's default www
# pool. `dpkg --verify` may list package files the slim base image drops (man
# pages), so assert specifically that the default pool is untouched.
www_verify="$(docker exec "$cid" dpkg --verify php8.5-fpm 2>/dev/null || true)"
if grep -q 'pool\.d/www\.conf' <<<"$www_verify"; then
    echo "check-container-config: dpkg --verify php8.5-fpm reports the default www pool as modified:" >&2
    echo "$www_verify" >&2
    exit 1
fi
echo "check-container-config: php8.5-fpm's default www pool is unchanged (dpkg --verify)"

# --- the client IP cannot be spoofed ---
# The panel trusts nginx (127.0.0.1/::1) and nginx trusts X-Forwarded-For only
# from TRUSTED_FRONT_PROXIES, empty by default. Drive the limiters from the
# Docker gateway (the host connecting to the container IP) with a rotating
# X-Forwarded-For: the header must be ignored, so both limiters key on the
# single gateway IP and answer 429 at the limit.
container_ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$cid")"
if [[ -z "$container_ip" ]]; then
    echo "check-container-config: could not read the container IP" >&2
    exit 1
fi

status_code() {
    # $1 path; remaining args: extra curl arguments
    local path="$1"
    shift
    curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" "http://${container_ip}${path}"
}

# --- the backend server is loopback-only ---
# :82 is an internal hop; only the container nginx (server 80) may reach
# it. From the docker gateway a direct connection is refused (curl codes it
# 000), while /api through the published front server (:80) still reaches the
# backend. Before the fix the wildcard bind answered the gateway.
backend_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://${container_ip}:82/" || true)"
if [[ "$backend_code" != "000" ]]; then
    echo "check-container-config: the backend on :82 answered the gateway (HTTP ${backend_code}); it must bind loopback only" >&2
    exit 1
fi
api_code="$(status_code /api/home || true)"
if [[ "$api_code" != "200" ]]; then
    echo "check-container-config: /api through :80 did not reach the backend (HTTP ${api_code})" >&2
    exit 1
fi
echo "check-container-config: :82 refuses the gateway and /api on :80 still reaches the backend (HTTP ${api_code})"

# Made-up bearers: the gatekeeper answers 401, and every answer
# still counts against the client-IP bucket.
mcp_limited=""
for i in $(seq 1 61); do
    code="$(status_code /mcp/check -H "Authorization: Bearer gateway-${i}" -H "X-Forwarded-For: 198.51.100.${i}")"
    if [[ "$code" == "429" ]]; then
        mcp_limited="$i"
        break
    fi
done
if [[ "$mcp_limited" != "61" ]]; then
    echo "check-container-config: the MCP IP limit is spoofable - expected 429 at request 61, got ${mcp_limited:-none}" >&2
    exit 1
fi
echo "check-container-config: rotating X-Forwarded-For cannot reset the MCP IP limit (429 at 61)"

login_limited=""
for i in $(seq 1 8); do
    code="$(status_code /api/login -H 'Content-Type: application/json' -H 'Accept: application/json' -H "X-Forwarded-For: 198.51.200.${i}" --data '{"email":"probe@example.com"}')"
    if [[ "$code" == "429" ]]; then
        login_limited="$i"
        break
    fi
done
if [[ "$login_limited" != "6" ]]; then
    echo "check-container-config: the login IP limit is spoofable - expected 429 at request 6, got ${login_limited:-none}" >&2
    exit 1
fi
echo "check-container-config: rotating X-Forwarded-For cannot reset the login IP limit (429 at 6)"

# --- the panel must know it is served over https ---
# The Engine proxy terminates TLS and sends X-Forwarded-Proto. An untrusted
# peer's value is ignored (the cookie is not Secure); a trusted front proxy's
# https is honoured (the cookie is Secure). The session cookie only appears on a
# stateful request, so the probe sends the SPA's own Origin.
session_cookie_secure() {
    # $1 X-Forwarded-Proto value; $2 X-Forwarded-For value (optional)
    local headers
    headers="$(curl -sI --max-time 10 \
        -H 'Origin: http://127.0.0.1' \
        -H "X-Forwarded-Proto: $1" \
        ${2:+-H "X-Forwarded-For: $2"} \
        "http://${container_ip}/api/home" | tr -d '\r')"
    if grep -qiE '^set-cookie: .*session=.*;[[:space:]]*secure' <<<"$headers"; then
        echo secure
    else
        echo insecure
    fi
}

untrusted_proto="$(session_cookie_secure https 198.51.100.9)"
if [[ "$untrusted_proto" != "insecure" ]]; then
    echo "check-container-config: an untrusted X-Forwarded-Proto marked the session cookie Secure" >&2
    exit 1
fi
echo "check-container-config: an untrusted X-Forwarded-Proto is ignored (session cookie not Secure)"

# With the gateway range explicitly trusted, the header *is* the client IP: a
# fresh X-Forwarded-For starts its own bucket, so the 61st request for one
# address is 429 again and a different address is not.
bridge_subnet="$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Subnet}}')"
if [[ -z "$bridge_subnet" ]]; then
    echo "check-container-config: could not read the bridge subnet" >&2
    exit 1
fi
docker exec "$cid" bash -c "TRUSTED_FRONT_PROXIES='${bridge_subnet}' bash /app/backend/scripts/write-trusted-proxies.sh"
docker exec "$cid" nginx -s reload -c /app/config/nginx.conf
sleep 1

spoofed_client="203.0.113.201"
trusted_limited=""
for i in $(seq 1 61); do
    code="$(status_code /mcp/check -H "Authorization: Bearer trusted-${i}" -H "X-Forwarded-For: ${spoofed_client}")"
    if [[ "$code" == "429" ]]; then
        trusted_limited="$i"
        break
    fi
done
if [[ "$trusted_limited" != "61" ]]; then
    echo "check-container-config: TRUSTED_FRONT_PROXIES did not use the X-Forwarded-For client IP (429 at ${trusted_limited:-none})" >&2
    exit 1
fi
# A token the panel minted, so the gatekeeper forwards it.
other_code="$(status_code /mcp/check -H 'Authorization: Bearer 1|probe-secret' -H 'X-Forwarded-For: 203.0.113.202')"
if [[ "$other_code" != "200" ]]; then
    echo "check-container-config: a different X-Forwarded-For client must keep its own bucket (got ${other_code})" >&2
    exit 1
fi
echo "check-container-config: with TRUSTED_FRONT_PROXIES the X-Forwarded-For client IP is the limit key"

trusted_proto="$(session_cookie_secure https 203.0.113.77)"
if [[ "$trusted_proto" != "secure" ]]; then
    echo "check-container-config: a trusted front proxy's https did not mark the session cookie Secure" >&2
    exit 1
fi
echo "check-container-config: a trusted front proxy's X-Forwarded-Proto https marks the session cookie Secure"

echo "check-container-config: php-fpm8.5 -tt, nginx -t, queue workers RUNNING and the MCP stream proof OK"
