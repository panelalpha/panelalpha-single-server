#!/usr/bin/env bash
#
# The panel signs a user in and changes account and project state (delete a
# project, change the e-mail address), so no other site may frame it
# (clickjacking) and no browser may second-guess a response's content type.
# Every response of the front server carries the set: the HTML, the static
# assets, the `/api` answers and nginx's own error pages (hence `always`). The
# `/ws` upgrade is a tunnel, not a page: it keeps its handshake answer as the
# upstream writes it (config/nginx.conf opts its location out).
#
# HSTS only when the panel's own URL is https. The Engine's front nginx
# terminates TLS and talks plain http to this container, so the request scheme
# here says nothing about the visitor's; APP_URL is the same fact
# write-https-redirect.sh keys the http->https redirect on, and an install
# served over http on purpose must not pin https in a browser. No
# includeSubDomains: the panel may share its parent domain with other services.
#
# The generated file is included by config/nginx.conf in the front server **and**
# in every location that sets its own `add_header` (a location with one drops
# the server's whole set).
#
# $1 is the filesystem root the config is written under (default /), so a test
# can run this fragment against a temp root. APP_URL is the
# panel's public origin (panelalpha.yaml `APP_URL: '${PA_PUBLIC_URL}'`).
set -euo pipefail

ROOT="${1:-}"
TARGET="$ROOT/etc/nginx/snippets/panelalpha-security-headers.conf"
URL="${APP_URL:-}"

mkdir -p "$ROOT/etc/nginx/snippets"

{
    printf '# Generated at container start by backend/scripts/write-security-headers.sh.\n'
    printf '# Included by the front server and by every location that sets its own add_header.\n'
    printf 'add_header X-Frame-Options "DENY" always;\n'
    printf 'add_header X-Content-Type-Options "nosniff" always;\n'
    printf 'add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n'
    if [[ "${URL,,}" == https://* ]]; then
        printf '# APP_URL is https: the browser may only reach the panel over https.\n'
        printf 'add_header Strict-Transport-Security "max-age=31536000" always;\n'
    else
        printf '# APP_URL is not https: no HSTS, http is served as it is.\n'
    fi
} > "$TARGET"
