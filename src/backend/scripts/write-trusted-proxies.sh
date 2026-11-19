#!/usr/bin/env bash
#
# The client IP the panel rate-limiters and activity logs key on must not be
# spoofable. The container nginx is the only reverse proxy in
# front of php-fpm, but a client that reaches it from another container or from
# the Docker gateway could set its own `X-Forwarded-For`. nginx therefore trusts
# `X-Forwarded-For` only from the CIDR list in TRUSTED_FRONT_PROXIES (empty by
# default -> no `set_real_ip_from`, so `$remote_addr` is the TCP peer) and
# rewrites the header to `$remote_addr` when it proxies to the backend, which in
# turn trusts only the container nginx (bootstrap/app.php).
#
# The generated file lives in the nginx `http` include (`include
# /etc/nginx/conf.d/*.conf;`), next to the upload-limit fragment entrypoint.sh
# writes. An existing file from an earlier start is removed when the list is
# empty, so a container that once trusted a proxy cannot keep trusting it.
#
# Every entry is validated before it reaches nginx: only an
# IPv4/IPv6 address or CIDR with a non-zero prefix is accepted, so a mistyped or
# hostile value (e.g. `1.2.3.4; include ...`) can never inject a directive. The
# catch-all prefixes (`0.0.0.0/0`, `::/0`) are refused because they would restore
# the review-14 Medium. An invalid entry makes the whole list untrusted (fail
# closed: trust nobody) and the script still exits 0, so the container start
# does not abort.
#
# Only the right-most X-Forwarded-For entry counts (`real_ip_recursive off`):
# the address the trusted hop itself saw. The Engine's proxies append to the
# header (`$proxy_add_x_forwarded_for`, templates/dind/virtualHost-nginx-proxy
# and virtualHost-nginx-proxy-app-lite) and reach this nginx over TCP – host
# nginx -> the dind project container's published port -> this container's
# :80, no HTTP hop between – so the last entry is the client the Engine's nginx
# accepted, and every entry left of it is the client's own text. With recursive
# on, nginx walked past every *trusted* entry: a client whose own address is
# private (a co-tenant container, another preview on the same host) is trusted
# itself, so the walk went on into an address it had prepended. An overwriting
# proxy (`X-Forwarded-For $remote_addr`) sends one entry, which is the last.
# What stays trusted is the TCP peer: a host in TRUSTED_FRONT_PROXIES that
# connects to this container directly sets the address it likes.
#
# $1 is the filesystem root the config is written under (default /), so a test
# can run this fragment against a temp root. TRUSTED_FRONT_PROXIES
# is a comma-separated CIDR list, e.g. "172.17.0.0/16,10.0.0.0/8".
set -euo pipefail

ROOT="${1:-}"
TARGET="$ROOT/etc/nginx/conf.d/01-panelalpha-real-ip.conf"
PROXIES="${TRUSTED_FRONT_PROXIES:-}"

mkdir -p "$ROOT/etc/nginx/conf.d"

entries=()
if [[ -n "$PROXIES" ]]; then
    IFS=',' read -ra raw <<< "$PROXIES"
    for entry in "${raw[@]}"; do
        entry="${entry//[[:space:]]/}"
        if [[ -n "$entry" ]]; then
            entries+=("$entry")
        fi
    done
fi

# Empty (or only separators) means nobody is trusted: no `set_real_ip_from` and
# no `real_ip_header`, so nginx never reads a client-supplied X-Forwarded-For.
if (( ${#entries[@]} == 0 )); then
    rm -f "$TARGET"

    exit 0
fi

is_valid_ipv4() {
    local address="$1" prefix="$2" octet
    [[ "$address" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1

    local IFS='.'
    for octet in $address; do
        (( 10#$octet <= 255 )) || return 1
    done

    if [[ -n "$prefix" ]]; then
        (( 10#$prefix >= 1 && 10#$prefix <= 32 )) || return 1
    fi

    return 0
}

is_valid_ipv6() {
    local address="$1" prefix="$2" without part groups=0 doubled=0
    [[ "$address" =~ ^[0-9a-fA-F:]+$ ]] || return 1
    # A valid IPv6 address never contains three consecutive colons, so `:::1`
    # and `1:::2` are rejected before the `::` handling below can accept them.
    [[ "$address" != *":::"* ]] || return 1

    if [[ "$address" == *"::"* ]]; then
        doubled=1
        # Replace only the **first** `::`; a second one left behind means more
        # than one abbreviation, e.g. `1::2::3`, which is not valid IPv6.
        without="${address/::/}"
        [[ "$without" != *"::"* ]] || return 1
    fi

    local IFS=':'
    local -a parts
    read -r -a parts <<< "$address"
    for part in "${parts[@]}"; do
        [[ -z "$part" ]] && continue
        [[ "$part" =~ ^[0-9a-fA-F]{1,4}$ ]] || return 1
        groups=$(( groups + 1 ))
    done

    if (( doubled )); then
        (( groups < 8 )) || return 1
    else
        (( groups == 8 )) || return 1
    fi

    if [[ -n "$prefix" ]]; then
        (( 10#$prefix >= 1 && 10#$prefix <= 128 )) || return 1
    fi

    return 0
}

is_valid_proxy() {
    local entry="$1" address prefix=""

    if [[ "$entry" == */* ]]; then
        address="${entry%%/*}"
        prefix="${entry#*/}"
        # `1.2.3.4/5/6` and a non-numeric prefix must not pass.
        [[ "$prefix" =~ ^[0-9]{1,3}$ ]] || return 1
    else
        address="$entry"
    fi

    [[ -n "$address" ]] || return 1

    if [[ "$address" == *:* ]]; then
        is_valid_ipv6 "$address" "$prefix"
    else
        is_valid_ipv4 "$address" "$prefix"
    fi
}

invalid=()
for entry in "${entries[@]}"; do
    if ! is_valid_proxy "$entry"; then
        invalid+=("$entry")
    fi
done

# A single bad entry makes the whole list untrusted: a typo must never leave a
# subset of the intended proxies trusted.
if (( ${#invalid[@]} > 0 )); then
    printf '[bootstrap] ignoring TRUSTED_FRONT_PROXIES: not an IPv4/IPv6 address or CIDR: %s\n' "${invalid[@]}" >&2
    rm -f "$TARGET"

    exit 0
fi

{
    printf '# Generated at container start by backend/scripts/write-trusted-proxies.sh.\n'
    printf '# X-Forwarded-For is trusted only from these front-proxy ranges.\n'
    for entry in "${entries[@]}"; do
        printf 'set_real_ip_from %s;\n' "$entry"
    done
    printf 'real_ip_header X-Forwarded-For;\n'
    printf '# Only the entry the trusted hop appended, never one the client sent.\n'
    printf 'real_ip_recursive off;\n'
} > "$TARGET"
