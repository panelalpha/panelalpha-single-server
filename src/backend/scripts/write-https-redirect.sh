#!/usr/bin/env bash
#
# Sends a visitor who reached the panel over http to https, when the panel's own
# URL is https. The session cookies are Secure (SESSION_SECURE_COOKIE),
# so over http the browser drops them and a login fails with a CSRF token
# mismatch; the Engine serves every domain on both :80 and :443 (and the
# server's own name too, `domain: host`, Engine 2.3.0), so an http visitor would
# otherwise land on a page that cannot sign in.
#
# The Engine's front nginx terminates TLS and sends the visitor's scheme in
# X-Forwarded-Proto (templates/virtualHost-nginx-proxy.blade.php: `$scheme`,
# overwritten, never the client's text), straight to this container's :80 over
# TCP. Only that hop's header counts: the real_ip module rewrote $remote_addr
# from X-Forwarded-For because the peer is in TRUSTED_FRONT_PROXIES
# (write-trusted-proxies.sh), so `$realip_remote_addr != $remote_addr`. A direct
# hit - the Engine's health check on 127.0.0.1:8080, an untrusted peer, any
# request while no front proxy is trusted - is never redirected.
#
# The generated file is included by the front server of config/nginx.conf
# (`include /etc/nginx/snippets/panelalpha-https-redirect.conf;`). With an http
# APP_URL (a panel served over http on purpose) the file holds only a comment,
# so nothing changes.
#
# $1 is the filesystem root the config is written under (default /), so a test
# can run this fragment against a temp root. APP_URL is the
# panel's public origin (panelalpha.yaml `APP_URL: '${PA_PUBLIC_URL}'`).
set -euo pipefail

ROOT="${1:-}"
TARGET="$ROOT/etc/nginx/snippets/panelalpha-https-redirect.conf"
URL="${APP_URL:-}"

mkdir -p "$ROOT/etc/nginx/snippets"

if [[ "${URL,,}" != https://* ]]; then
    printf '# Generated at container start by backend/scripts/write-https-redirect.sh.\n# APP_URL is not https: http is served as it is.\n' > "$TARGET"

    exit 0
fi

cat > "$TARGET" <<'EOF'
# Generated at container start by backend/scripts/write-https-redirect.sh.
# APP_URL is https: a visitor the trusted front proxy reports as http goes to https.
set $panelalpha_visitor_scheme "";
if ($realip_remote_addr != $remote_addr) {
    set $panelalpha_visitor_scheme $http_x_forwarded_proto;
}
if ($panelalpha_visitor_scheme = "http") {
    return 308 https://$host$request_uri;
}
EOF
