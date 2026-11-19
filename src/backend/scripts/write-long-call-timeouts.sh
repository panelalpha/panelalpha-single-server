#!/usr/bin/env bash
#
# Request-path timeout headroom for the synchronous long Engine calls:
# DELETE /projects/{application} (ProjectService::delete),
# PUT /projects/{application}/retry-staging/{stagingId} (StagingService::retry),
# POST /projects/upload-files (OnboardingDeployService::uploadFiles - a large
# archive over a slow link) and the files-source onboarding domain step
# POST /services/{service}/domains, which waits for the Engine create task
# (ProvisionWaiter), and the SSH git connect POST /projects/{application}/git/connect,
# which waits for the create task of a project the wizard just made
# (GitService::connect), plus POST git/deploy and PUT change-branch, which wait for
# a settle rebuild of a never-deployed checkout before switching branch
# (GitCheckoutService::deploy, GitService::changeBranch). The CA calls the first three through the /instances alias
# as well (CA: src/mixins/InstanceActionsMixin.js:298,
# src/components/modal/CreateStagingModal.vue:313). The CA consumes their
# response, so they stay on the request path while the Engine calls may run
# sequentially up to the 1700 s per-call timeout plus the surrounding calls.
#
# The PHP limits are route-scoped too: the long locations
# pass to a dedicated [long] php-fpm pool with its own socket, so the default
# www pool keeps the defaults and a long call cannot starve normal requests.
# The backend snippet also scopes the headroom by HTTP method: only the long
# write reaches the [long] pool, a fast GET/PUT keeps the default www pool.
# This script also writes the dedicated [stream] pool for the long-lived
# `/mcp` pass-through, so an open SSE stream cannot
# occupy a www worker either.
# nginx and php-fpm must allow the whole route.
#
# Files an earlier container image or an earlier start of this script wrote (a
# global fpm ini, the old [www] pool fragment and the old http-wide nginx
# long-call conf) are removed first so the route-scoped config always wins.
#
# $1 is the filesystem root the config is written under (default /), so a test
# can run this fragment against a temp root. LONG_CALL_TIMEOUT_SECONDS overrides
# the generated value (default 1800 = the per-call timeout plus headroom).
set -euo pipefail

ROOT="${1:-}"
TIMEOUT_SECONDS="${LONG_CALL_TIMEOUT_SECONDS:-1800}"
LONG_SOCKET="/var/run/php/php8.5-fpm-long.sock"
STREAM_SOCKET="/var/run/php/php8.5-fpm-stream.sock"
WWW_SOCKET="/var/run/php/php8.5-fpm.sock"

mkdir -p \
    "$ROOT/etc/php/8.5/fpm/pool.d" \
    "$ROOT/etc/nginx/snippets"

# Remove the previous shape: a global fpm ini, the old [www] pool
# fragment and the retired http-wide nginx long-call conf. Without this an
# upgraded container would keep a global max_execution_time or a second long
# location that bypasses the route/method scoping.
rm -f \
    "$ROOT/etc/php/8.5/fpm/conf.d/99-panelalpha-timeouts.ini" \
    "$ROOT/etc/php/8.5/cli/conf.d/99-panelalpha-timeouts.ini" \
    "$ROOT/etc/php/8.5/fpm/pool.d/zz-panelalpha-timeouts.conf" \
    "$ROOT/etc/nginx/conf.d/10-panelalpha-long-call.conf"

# Every web-request failure must reach `docker logs`. FPM
# discards a worker's stdout/stderr unless the pool sets `catch_workers_output`,
# and FPM's own error log defaulted to a file inside the container. Point the
# global error log at stderr and turn catching on for the default [www] pool:
# `catch_workers_output` is per-pool, and this repository never edits the
# package's pool.d/www.conf (the container check asserts `dpkg --verify
# php8.5-fpm`), so a later file re-declares only those two [www] directives -
# FPM merges them into the existing pool and the listen socket is untouched.
# `decorate_workers_output = no` keeps Laravel's own line format.
cat > "$ROOT/etc/php/8.5/fpm/pool.d/zzz-panelalpha-logging.conf" <<EOF
; Generated at container start by backend/scripts/write-long-call-timeouts.sh.
; Web-request errors must reach \`docker logs\` and the daily file.
[global]
error_log = /proc/self/fd/2

[www]
catch_workers_output = yes
decorate_workers_output = no
EOF

# PHP itself: only fpm serves requests. No CLI ini (CLI forces
# max_execution_time = 0 and runs no web request). The headroom lives in a
# dedicated pool, never a global ini, and the default www pool is untouched.
cat > "$ROOT/etc/php/8.5/fpm/pool.d/zz-panelalpha-long.conf" <<EOF
; Generated at container start by backend/scripts/write-long-call-timeouts.sh.
; The long request-path locations pass to this pool; the default www pool keeps
; its own limits so a long call cannot starve normal requests.
[long]
user = www-data
group = www-data
listen = ${LONG_SOCKET}
listen.owner = www-data
listen.group = www-data
pm = dynamic
pm.max_children = 5
pm.start_servers = 1
pm.min_spare_servers = 1
pm.max_spare_servers = 3
request_terminate_timeout = ${TIMEOUT_SECONDS}s
php_admin_value[max_execution_time] = ${TIMEOUT_SECONDS}
; An uploaded archive the CA advertises up to 256 MB plus its
; multipart overhead must fit one long-pool worker even if PHP holds a copy of
; the body; the file-manager path already has this headroom on the www pool.
php_admin_value[memory_limit] = 512M
catch_workers_output = yes
decorate_workers_output = no
EOF

# Long-lived streams (/mcp, /mcp/check) get their own pool and socket, so an
# open SSE stream can never occupy a www worker and starve the Client Area
#A stream carries no total request timeout - the
# assistant keeps it open while it waits - and the controller empties PHP's
# output buffer per chunk (`ob_flush()`), so this pool deliberately keeps the
# image's `output_buffering` on: that is the buffering the real-image proof
# covers. nginx's 1800 s `fastcgi_read_timeout`
# is the idle guard, matching EngineClient::MCP_STREAM_READ_TIMEOUT_SECONDS.
cat > "$ROOT/etc/php/8.5/fpm/pool.d/zz-panelalpha-stream.conf" <<EOF
; Generated at container start by backend/scripts/write-long-call-timeouts.sh.
; Long-lived streams pass to this pool, never the www pool.
[stream]
user = www-data
group = www-data
listen = ${STREAM_SOCKET}
listen.owner = www-data
listen.group = www-data
pm = dynamic
pm.max_children = 5
pm.start_servers = 1
pm.min_spare_servers = 1
pm.max_spare_servers = 3
request_terminate_timeout = 0
php_admin_value[max_execution_time] = 0
catch_workers_output = yes
decorate_workers_output = no
EOF

# nginx: the headroom is route-scoped, never http-wide, so only the long calls
# get it. A regex `location` wins over the prefix `/api` (80/81) or `/` (82)
# location, so it must repeat that server's pass directive and headers -
# otherwise the request never reaches the backend. Servers 80/81 proxy to the
# backend, server 82 speaks fastcgi, hence one snippet each. The proxy snippet
# cannot scope by method, so the project-detail regex also covers its fast GET;
# the backend snippet scopes the write to the [long] pool.
cat > "$ROOT/etc/nginx/snippets/panelalpha-long-call.conf" <<EOF
# Generated at container start by backend/scripts/write-long-call-timeouts.sh;
# included from servers 80/81, which proxy /api to the backend.
# The upstream is the IPv4 loopback, never \`localhost\` (which may resolve to
# ::1 first and break when IPv6 is disabled).
location ~ ^/api/(projects|instances)/[0-9]+\$ {
    proxy_read_timeout ${TIMEOUT_SECONDS}s;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header REMOTE_ADDR \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Host \$server_name;
    proxy_pass http://127.0.0.1:82;
}

location ~ ^/api/(projects|instances)/[0-9]+/retry-staging/[0-9]+\$ {
    proxy_read_timeout ${TIMEOUT_SECONDS}s;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header REMOTE_ADDR \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Host \$server_name;
    proxy_pass http://127.0.0.1:82;
}

# The archive upload is a long request-path call too
# (DeployService::uploadArchive with EngineClient::LONG_TIMEOUT_SECONDS).
location ~ ^/api/(projects|instances)/[0-9]+/deploy/upload\$ {
    proxy_read_timeout ${TIMEOUT_SECONDS}s;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header REMOTE_ADDR \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Host \$server_name;
    proxy_pass http://127.0.0.1:82;
}

location ~ ^/api/(projects|instances)/upload-files\$ {
    proxy_read_timeout ${TIMEOUT_SECONDS}s;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header REMOTE_ADDR \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Host \$server_name;
    proxy_pass http://127.0.0.1:82;
}

location ~ ^/api/services/[0-9]+/domains\$ {
    proxy_read_timeout ${TIMEOUT_SECONDS}s;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header REMOTE_ADDR \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Host \$server_name;
    proxy_pass http://127.0.0.1:82;
}

location ~ ^/api/(projects|instances)/[0-9]+/git/connect\$ {
    proxy_read_timeout ${TIMEOUT_SECONDS}s;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header REMOTE_ADDR \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Host \$server_name;
    proxy_pass http://127.0.0.1:82;
}

location ~ ^/api/(projects|instances)/[0-9]+/git/deploy\$ {
    proxy_read_timeout ${TIMEOUT_SECONDS}s;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header REMOTE_ADDR \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Host \$server_name;
    proxy_pass http://127.0.0.1:82;
}

location ~ ^/api/(projects|instances)/[0-9]+/change-branch\$ {
    proxy_read_timeout ${TIMEOUT_SECONDS}s;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header REMOTE_ADDR \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Host \$server_name;
    proxy_pass http://127.0.0.1:82;
}
EOF

cat > "$ROOT/etc/nginx/snippets/panelalpha-long-call-backend.conf" <<EOF
# Generated at container start by backend/scripts/write-long-call-timeouts.sh;
# included from server 82, which serves the backend through php-fpm.
# Only the long write reaches the dedicated [long] pool. The project-detail
# regex also matches its fast GET/PUT and the services-domains regex also matches
# its fast GET, so those fall through to the default www pool.
location ~ ^/api/(projects|instances)/[0-9]+\$ {
    fastcgi_read_timeout ${TIMEOUT_SECONDS}s;
    include /etc/nginx/fastcgi_params;
    fastcgi_param SCRIPT_FILENAME \$realpath_root/index.php;
    fastcgi_param SCRIPT_NAME /index.php;
    if (\$request_method = DELETE) {
        fastcgi_pass unix:${LONG_SOCKET};
    }
    fastcgi_pass unix:${WWW_SOCKET};
}

location ~ ^/api/(projects|instances)/[0-9]+/retry-staging/[0-9]+\$ {
    fastcgi_read_timeout ${TIMEOUT_SECONDS}s;
    fastcgi_pass unix:${LONG_SOCKET};
    include /etc/nginx/fastcgi_params;
    fastcgi_param SCRIPT_FILENAME \$realpath_root/index.php;
    fastcgi_param SCRIPT_NAME /index.php;
}

# The archive upload is a long request-path call and gets the
# [long] pool's timeout and memory headroom (DeployService::uploadArchive).
location ~ ^/api/(projects|instances)/[0-9]+/deploy/upload\$ {
    fastcgi_read_timeout ${TIMEOUT_SECONDS}s;
    fastcgi_pass unix:${LONG_SOCKET};
    include /etc/nginx/fastcgi_params;
    fastcgi_param SCRIPT_FILENAME \$realpath_root/index.php;
    fastcgi_param SCRIPT_NAME /index.php;
}

location ~ ^/api/(projects|instances)/upload-files\$ {
    fastcgi_read_timeout ${TIMEOUT_SECONDS}s;
    fastcgi_pass unix:${LONG_SOCKET};
    include /etc/nginx/fastcgi_params;
    fastcgi_param SCRIPT_FILENAME \$realpath_root/index.php;
    fastcgi_param SCRIPT_NAME /index.php;
}

location ~ ^/api/services/[0-9]+/domains\$ {
    fastcgi_read_timeout ${TIMEOUT_SECONDS}s;
    include /etc/nginx/fastcgi_params;
    fastcgi_param SCRIPT_FILENAME \$realpath_root/index.php;
    fastcgi_param SCRIPT_NAME /index.php;
    if (\$request_method = POST) {
        fastcgi_pass unix:${LONG_SOCKET};
    }
    fastcgi_pass unix:${WWW_SOCKET};
}

location ~ ^/api/(projects|instances)/[0-9]+/git/connect\$ {
    fastcgi_read_timeout ${TIMEOUT_SECONDS}s;
    fastcgi_pass unix:${LONG_SOCKET};
    include /etc/nginx/fastcgi_params;
    fastcgi_param SCRIPT_FILENAME \$realpath_root/index.php;
    fastcgi_param SCRIPT_NAME /index.php;
}

location ~ ^/api/(projects|instances)/[0-9]+/git/deploy\$ {
    fastcgi_read_timeout ${TIMEOUT_SECONDS}s;
    fastcgi_pass unix:${LONG_SOCKET};
    include /etc/nginx/fastcgi_params;
    fastcgi_param SCRIPT_FILENAME \$realpath_root/index.php;
    fastcgi_param SCRIPT_NAME /index.php;
}

location ~ ^/api/(projects|instances)/[0-9]+/change-branch\$ {
    fastcgi_read_timeout ${TIMEOUT_SECONDS}s;
    fastcgi_pass unix:${LONG_SOCKET};
    include /etc/nginx/fastcgi_params;
    fastcgi_param SCRIPT_FILENAME \$realpath_root/index.php;
    fastcgi_param SCRIPT_NAME /index.php;
}
EOF
