#!/bin/bash
set -e

echo "[bootstrap] ensure laravel storage"
mkdir -p /app/data/laravel
cd /app/data/laravel
mkdir -p app/private app/public framework/cache/data framework/sessions framework/testing framework/views logs database
if [[ ! -f database/database.sqlite ]]; then
    touch database/database.sqlite
fi
chown -R www-data:www-data /app/data/laravel
echo "[bootstrap] laravel storage OK"

cd /app/backend
echo "[bootstrap] ensure laravel dependencies"
if [[ ! -f vendor/autoload.php ]]; then
    echo "[bootstrap] laravel vendor/ missing - running composer install"
    composer install --no-interaction --prefer-dist --optimize-autoloader
fi
echo "[bootstrap] laravel dependencies OK"
echo "[bootstrap] ensure laravel .env file"
if [[ ! -f .env ]]; then
    echo "[bootstrap] .env file missing - creating"
    cp .env.example .env
fi
echo "[bootstrap] laravel .env file OK"
# --- persisted app key: start ---
# The Engine re-clones ~/project on every redeploy and keeps /app/data, so the
# key must live on the volume: sessions and encrypted settings survive a
# redeploy. PANELALPHA_DATA_ROOT / PANELALPHA_BACKEND_ROOT
# let EngineRuntimeBootstrapTest run this fragment against a temp root
#The key is never echoed.
DATA_ROOT="${PANELALPHA_DATA_ROOT:-/app/data}"
BACKEND_ROOT="${PANELALPHA_BACKEND_ROOT:-/app/backend}"
APP_KEY_FILE="$DATA_ROOT/app_key"
ENV_FILE="$BACKEND_ROOT/.env"
echo "[bootstrap] ensure laravel APP_KEY"
mkdir -p "$DATA_ROOT"
file_key=""
[[ -s "$APP_KEY_FILE" ]] && file_key="$(tr -d '[:space:]' < "$APP_KEY_FILE")"
env_key=""
if [[ -f "$ENV_FILE" ]]; then
    env_key="$(grep -E '^APP_KEY=.?base64:.+' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d "\"'" | tr -d '[:space:]')"
fi
if [[ -n "$file_key" ]]; then
    app_key="$file_key"
elif [[ -n "$env_key" ]]; then
    app_key="$env_key"
else
    app_key="base64:$(head -c 32 /dev/urandom | base64 | tr -d '[:space:]')"
fi
printf '%s\n' "$app_key" > "$APP_KEY_FILE"
chmod 600 "$APP_KEY_FILE" || true
if [[ -f "$ENV_FILE" ]]; then
    if grep -q '^APP_KEY=' "$ENV_FILE"; then
        sed -i "s|^APP_KEY=.*|APP_KEY=$app_key|" "$ENV_FILE"
    else
        printf 'APP_KEY=%s\n' "$app_key" >> "$ENV_FILE"
    fi
fi
echo "[bootstrap] laravel APP_KEY OK"
# --- persisted app key: end ---

# --- reverb credentials: start ---
# REVERB_APP_ID and REVERB_APP_SECRET are generated once per install and kept on
# the /app/data volume, exactly like APP_KEY, so no two installs share a
# websocket signing secret. REVERB_APP_KEY is the *public* Pusher
# key the unchanged Client Area hard-codes
# (packages/client-area/src/apis/Auth.js:340) and reads from no endpoint, so it
# stays one compatibility constant on every install; only the signing secret
# rotates. The generated values feed the runtime-configuration block below,
# which renders them into backend/.env. PANELALPHA_DATA_ROOT lets
# EngineRuntimeBootstrapTest run this against a temp root.
DATA_ROOT="${PANELALPHA_DATA_ROOT:-/app/data}"
REVERB_ID_FILE="$DATA_ROOT/reverb_app_id"
REVERB_SECRET_FILE="$DATA_ROOT/reverb_app_secret"
reverb_rand() {
    # No openssl dependency: hex from /dev/urandom, 2 x $1 characters.
    head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
}
mkdir -p "$DATA_ROOT"
if [[ -s "$REVERB_ID_FILE" ]]; then
    REVERB_APP_ID="$(tr -d '[:space:]' < "$REVERB_ID_FILE")"
else
    REVERB_APP_ID="$(reverb_rand 8)"
    printf '%s\n' "$REVERB_APP_ID" > "$REVERB_ID_FILE"
fi
if [[ -s "$REVERB_SECRET_FILE" ]]; then
    REVERB_APP_SECRET="$(tr -d '[:space:]' < "$REVERB_SECRET_FILE")"
else
    REVERB_APP_SECRET="$(reverb_rand 32)"
    printf '%s\n' "$REVERB_APP_SECRET" > "$REVERB_SECRET_FILE"
fi
chmod 600 "$REVERB_ID_FILE" "$REVERB_SECRET_FILE" 2>/dev/null || true
REVERB_APP_KEY="89c60f11-c289-4d3e-9122-95502ac670ca"
echo "[bootstrap] reverb credentials OK"
# --- reverb credentials: end ---

# --- runtime configuration: start ---
# php-fpm runs with its default `clear_env = yes`, so a web request never sees
# the container environment the Engine sets; Laravel then falls back to the
# backend/.env copied from .env.example, so Sanctum never treats the CA as
# stateful and the login answers 500. Render the runtime
# configuration into backend/.env at every start, so php-fpm, Reverb, the queue
# and artisan all read the same values. The Engine credential and the
# first-user password are deliberately not in the list: the settings table and
# the user row already hold them, so a leaked .env can never reach the Engine or
# the first user. PANELALPHA_BACKEND_ROOT lets
# EngineRuntimeBootstrapTest run this block against a temp root.
# PA_SMTP_HOST / PA_SMTP_PORT are the mail relay the Engine hands the account;
# the panel sends there when the first is set (community's EngineMailRelay),
# so php-fpm must see them too.
BACKEND_ROOT="${PANELALPHA_BACKEND_ROOT:-/app/backend}"
ENV_FILE="$BACKEND_ROOT/.env"
RUNTIME_ENV_KEYS=(
    APP_ENV APP_DEBUG APP_URL
    SESSION_DRIVER SESSION_SAME_SITE
    SESSION_SECURE_COOKIE
    SANCTUM_PREFIX SANCTUM_STATEFUL_DOMAINS
    QUEUE_CONNECTION CACHE_STORE BROADCAST_CONNECTION LOG_CHANNEL LOG_STACK
    TRUSTED_FRONT_PROXIES
    REVERB_APP_ID REVERB_APP_KEY REVERB_APP_SECRET
    REVERB_HOST REVERB_PORT REVERB_SCHEME
    REVERB_SERVER_HOST REVERB_SERVER_PORT
    PANELALPHA_SELF_PROJECT
    PANELALPHA_PRODUCT
    HUB_URL
    PA_SMTP_HOST PA_SMTP_PORT
)
# A value with a newline would inject a new key and phpdotenv expands ${VAR} in
# unquoted/double-quoted values, so single-quote it and skip a value that
# carries a quote or a newline (the operator sees the warning; the app keeps
# the .env.example default). Pure sed/grep so the fragment test can run it.
render_runtime_env() {
    local key="$1" value="$2" tmp
    if [[ "$value" == *$'\n'* || "$value" == *"'"* ]]; then
        echo "[bootstrap] cannot render $key - unsupported character in the value" >&2
        return 0
    fi
    tmp="$ENV_FILE.panelalpha.$$"
    grep -v "^${key}=" "$ENV_FILE" > "$tmp" 2>/dev/null || true
    printf "%s='%s'\n" "$key" "$value" >> "$tmp"
    mv "$tmp" "$ENV_FILE"
}
if [[ -f "$ENV_FILE" ]]; then
    for runtime_key in "${RUNTIME_ENV_KEYS[@]}"; do
        runtime_value="${!runtime_key:-}"
        [[ -n "$runtime_value" ]] && render_runtime_env "$runtime_key" "$runtime_value"
    done
    # The file can carry the per-install Reverb secret; give the www-data
    # workers (php-fpm, Reverb, the queue, the scheduler) read access without
    # widening it to the whole container. The test fragment runs as a normal
    # user, so both steps are best-effort there.
    chown root:www-data "$ENV_FILE" 2>/dev/null || true
    chmod 640 "$ENV_FILE" 2>/dev/null || true
fi
echo "[bootstrap] runtime configuration rendered into backend/.env"
# --- runtime configuration: end ---

# --- upload limits: start ---
# The file-manager upload limit the SPA receives comes from
# USER_APPLICATION_UPLOAD_MAX_BYTES (package config). PHP's own limits are
# written from the same value here, so a file at the limit is accepted:
# post_max_size must exceed upload_max_filesize (multipart overhead).
# PHP_CONF_ROOT / NGINX_CONF_ROOT let UploadLimitsTest run this fragment against
# a temp root and assert the generated files.
PHP_CONF_ROOT="${PHP_CONF_ROOT:-/etc/php/8.5}"
NGINX_CONF_ROOT="${NGINX_CONF_ROOT:-/etc/nginx}"
UPLOAD_MAX_BYTES="${USER_APPLICATION_UPLOAD_MAX_BYTES:-}"
if [[ -z "$UPLOAD_MAX_BYTES" && -f /app/backend/.env ]]; then
    UPLOAD_MAX_BYTES="$(grep -E '^USER_APPLICATION_UPLOAD_MAX_BYTES=' /app/backend/.env | tail -1 | cut -d= -f2- | tr -d '"')"
fi
UPLOAD_MAX_BYTES="${UPLOAD_MAX_BYTES:-268435456}"
# Round **up** to whole MB: a file exactly at the configured byte limit must be
# accepted, so a partial MB is never rounded down.
UPLOAD_MAX_MB=$(( (UPLOAD_MAX_BYTES + 1048575) / 1048576 ))
if (( UPLOAD_MAX_MB < 1 )); then UPLOAD_MAX_MB=1; fi
POST_MAX_MB=$(( UPLOAD_MAX_MB + 1 ))
for SAPI in fpm cli; do
    mkdir -p "$PHP_CONF_ROOT/$SAPI/conf.d"
    printf 'upload_max_filesize=%sM\npost_max_size=%sM\n' "$UPLOAD_MAX_MB" "$POST_MAX_MB" > "$PHP_CONF_ROOT/$SAPI/conf.d/99-panelalpha.ini"
done
# nginx rejects a body over client_max_body_size before php-fpm sees it; the
# limit comes from the same env value (config/nginx.conf includes
# /etc/nginx/conf.d/*.conf).
mkdir -p "$NGINX_CONF_ROOT/conf.d"
printf 'client_max_body_size %sM;\n' "$POST_MAX_MB" > "$NGINX_CONF_ROOT/conf.d/00-panelalpha-upload-limit.conf"
echo "[bootstrap] PHP upload limits: ${UPLOAD_MAX_MB}M / post ${POST_MAX_MB}M"
# --- upload limits: end ---

# --- trusted front proxies: start ---
# Every trusted proxy hop is explicit and opt-in. nginx trusts
# X-Forwarded-For only from the CIDR list in TRUSTED_FRONT_PROXIES (empty by
# default -> no set_real_ip_from). TRUSTED_PROXY_ROOT / TRUSTED_PROXY_SCRIPT let
# TrustedProxyTest run this block against a temp root and assert the generated
# file; they default to the container's real paths.
# TRUSTED_PROXY_ENV overrides the .env file the value falls back to, so the
# fallback can be tested without touching the checkout's .env.
TRUSTED_PROXY_ROOT="${TRUSTED_PROXY_ROOT:-}"
TRUSTED_PROXY_SCRIPT="${TRUSTED_PROXY_SCRIPT:-/app/backend/scripts/write-trusted-proxies.sh}"
TRUSTED_PROXY_ENV="${TRUSTED_PROXY_ENV:-/app/backend/.env}"
TRUSTED_FRONT_PROXIES="${TRUSTED_FRONT_PROXIES:-}"
if [[ -z "$TRUSTED_FRONT_PROXIES" && -f "$TRUSTED_PROXY_ENV" ]]; then
    TRUSTED_FRONT_PROXIES="$(grep -E '^TRUSTED_FRONT_PROXIES=' "$TRUSTED_PROXY_ENV" | tail -1 | cut -d= -f2- | tr -d '"')"
fi
export TRUSTED_FRONT_PROXIES
bash "$TRUSTED_PROXY_SCRIPT" "$TRUSTED_PROXY_ROOT"
echo "[bootstrap] trusted front proxies: ${TRUSTED_FRONT_PROXIES:-none}"
# --- trusted front proxies: end ---

# --- https redirect: start ---
# With an https APP_URL, a visitor the trusted front proxy reports as http is
# sent to https: the session cookies are Secure, so a login over http fails.
# HTTPS_REDIRECT_ROOT / HTTPS_REDIRECT_SCRIPT let HttpsRedirectTest run this
# block against a temp root; HTTPS_REDIRECT_ENV is the .env file APP_URL falls
# back to. They default to the container's real paths.
HTTPS_REDIRECT_ROOT="${HTTPS_REDIRECT_ROOT:-}"
HTTPS_REDIRECT_SCRIPT="${HTTPS_REDIRECT_SCRIPT:-/app/backend/scripts/write-https-redirect.sh}"
HTTPS_REDIRECT_ENV="${HTTPS_REDIRECT_ENV:-/app/backend/.env}"
if [[ -z "${APP_URL:-}" && -f "$HTTPS_REDIRECT_ENV" ]]; then
    APP_URL="$(grep -E '^APP_URL=' "$HTTPS_REDIRECT_ENV" | tail -1 | cut -d= -f2- | tr -d '"')"
fi
APP_URL="${APP_URL:-}" bash "$HTTPS_REDIRECT_SCRIPT" "$HTTPS_REDIRECT_ROOT"
echo "[bootstrap] https redirect: $([[ "${APP_URL,,}" == https://* ]] && echo on || echo off)"
# --- https redirect: end ---

# --- security headers: start ---
# Every response of the front server refuses framing and content sniffing, and
# carries HSTS when APP_URL is https (the Engine's proxy terminates TLS, so
# only APP_URL says whether the visitor may be pinned to https).
# SECURITY_HEADERS_ROOT / SECURITY_HEADERS_SCRIPT let SecurityHeadersTest run
# this block against a temp root; SECURITY_HEADERS_ENV is the .env file APP_URL
# falls back to. They default to the container's real paths.
SECURITY_HEADERS_ROOT="${SECURITY_HEADERS_ROOT:-}"
SECURITY_HEADERS_SCRIPT="${SECURITY_HEADERS_SCRIPT:-/app/backend/scripts/write-security-headers.sh}"
SECURITY_HEADERS_ENV="${SECURITY_HEADERS_ENV:-/app/backend/.env}"
if [[ -z "${APP_URL:-}" && -f "$SECURITY_HEADERS_ENV" ]]; then
    APP_URL="$(grep -E '^APP_URL=' "$SECURITY_HEADERS_ENV" | tail -1 | cut -d= -f2- | tr -d '"')"
fi
APP_URL="${APP_URL:-}" bash "$SECURITY_HEADERS_SCRIPT" "$SECURITY_HEADERS_ROOT"
echo "[bootstrap] security headers: $([[ "${APP_URL,,}" == https://* ]] && echo 'hsts' || echo 'no hsts')"
# --- security headers: end ---

# --- long-call timeouts: start ---
# The long request-path Engine calls (project delete, retry-staging,
# upload-files, the onboarding domain wait) run synchronously while the CA
# waits; give nginx and a dedicated php-fpm pool
# route-scoped headroom above the Engine per-call timeout. LONG_CALL_ROOT / LONG_CALL_SCRIPT let
# LongCallTimeoutsTest run this block against a temp root; they default to the
# container's real paths.
LONG_CALL_ROOT="${LONG_CALL_ROOT:-}"
LONG_CALL_SCRIPT="${LONG_CALL_SCRIPT:-/app/backend/scripts/write-long-call-timeouts.sh}"
bash "$LONG_CALL_SCRIPT" "$LONG_CALL_ROOT"
echo "[bootstrap] long request-path timeouts written"
# --- long-call timeouts: end ---

echo "[bootstrap] running migrations"
php artisan migrate --force --no-interaction
echo "[bootstrap] migrations OK"

# --- engine credentials: start ---
# PANELALPHA_ENGINE_URL / PANELALPHA_ENGINE_TOKEN are delivered by the Engine
# (`pae system:api-access:allow`), which owns them and rotates the
# token (`pae system:api-access:rotate`). While a variable is present it is the
# source of truth: it is written into the settings table at every start when it
# differs from the stored value, so a rotated token reaches the panel on the
# next boot (this replaced an older seed-once rule). An
# operator who wants a hand-set value removes the variable and uses
# `settings:set`. One `[bootstrap]` line per outcome (`updated`, `kept`); a
# value is never logged.
#
# `settings:get <name>` prints `Setting not found: <name>` on **stdout** and
# exits non-zero for a missing key, so the stored value only
# counts when the command succeeds. Testable via PANELALPHA_BACKEND_ROOT and a
# stub `php`.
BACKEND_ROOT="${PANELALPHA_BACKEND_ROOT:-/app/backend}"
follow_engine_setting() {
    local name="$1" variable="$2" value="$3" stored
    if stored="$(cd "$BACKEND_ROOT" && php artisan settings:get "$name" 2>/dev/null)" && [[ "$stored" == "$value" ]]; then
        echo "[bootstrap] $name kept - matches $variable"
    elif (cd "$BACKEND_ROOT" && php artisan settings:set "$name" "$value" >/dev/null); then
        echo "[bootstrap] $name updated from $variable"
    else
        echo "[bootstrap] $name update failed - check $variable / the settings table" >&2
    fi
}
if [[ -n "${PANELALPHA_ENGINE_URL:-}" ]]; then
    follow_engine_setting engine-api-url PANELALPHA_ENGINE_URL "$PANELALPHA_ENGINE_URL"
fi
if [[ -n "${PANELALPHA_ENGINE_TOKEN:-}" ]]; then
    follow_engine_setting engine-api-token PANELALPHA_ENGINE_TOKEN "$PANELALPHA_ENGINE_TOKEN"
fi
# --- engine credentials: end ---

# --- engine certificate: start ---
# PANELALPHA_ENGINE_CA (PEM text or a path under the data volume) pins the
# certificate of a self-signed Engine or hairpin. Like the URL
# and token it is followed at every start: a delivered CA that
# differs from `engine-api-ca` replaces it. `settings:set` validates the PEM, so
# an invalid value is refused and the boot continues.
#
# The Engine delivers the URL **without** a CA when :2011 serves a publicly trusted
# certificate. A pin an earlier boot wrote from the env must then go, or a stale
# self-signed pin would reject the trusted certificate; a pin the operator set
# by hand stays. The marker file records the SHA-256 of the pin last written
# from the env, so only that exact value is cleared (a later hand-set pin has a
# different fingerprint and is kept). No value is ever logged.
# PANELALPHA_DATA_ROOT / PANELALPHA_BACKEND_ROOT let the fragment test run this
# against a temp root.
DATA_ROOT="${PANELALPHA_DATA_ROOT:-/app/data}"
BACKEND_ROOT="${PANELALPHA_BACKEND_ROOT:-/app/backend}"
ENGINE_CA_MARKER="$DATA_ROOT/engine-api-ca.from-env"
engine_ca_fingerprint() {
    printf '%s' "$1" | sha256sum | cut -d' ' -f1
}
if [[ -n "${PANELALPHA_ENGINE_CA:-}" ]]; then
    ca_path=""
    if [[ "$PANELALPHA_ENGINE_CA" == *"-----BEGIN"* ]]; then
        ca_path="$DATA_ROOT/engine-api-ca.pem"
        printf '%s\n' "$PANELALPHA_ENGINE_CA" > "$ca_path"
        chmod 600 "$ca_path" 2>/dev/null || true
    elif [[ "$PANELALPHA_ENGINE_CA" == "$DATA_ROOT/"* && -f "$PANELALPHA_ENGINE_CA" ]]; then
        ca_path="$PANELALPHA_ENGINE_CA"
    elif [[ -f "$DATA_ROOT/$PANELALPHA_ENGINE_CA" ]]; then
        ca_path="$DATA_ROOT/$PANELALPHA_ENGINE_CA"
    fi
    if [[ -z "$ca_path" ]]; then
        echo "[bootstrap] PANELALPHA_ENGINE_CA is neither PEM text nor a path under the data volume - skipped" >&2
    else
        delivered_ca="$(cat "$ca_path")"
        if stored_ca="$(cd "$BACKEND_ROOT" && php artisan settings:get engine-api-ca 2>/dev/null)" && [[ "$stored_ca" == "$delivered_ca" ]]; then
            engine_ca_fingerprint "$delivered_ca" > "$ENGINE_CA_MARKER"
            echo "[bootstrap] engine-api-ca kept - matches PANELALPHA_ENGINE_CA"
        elif (cd "$BACKEND_ROOT" && php artisan settings:set engine-api-ca --from-file="$ca_path" >/dev/null); then
            engine_ca_fingerprint "$delivered_ca" > "$ENGINE_CA_MARKER"
            echo "[bootstrap] engine-api-ca updated from PANELALPHA_ENGINE_CA"
        else
            echo "[bootstrap] PANELALPHA_ENGINE_CA is not a valid PEM certificate - skipped" >&2
        fi
    fi
elif [[ -n "${PANELALPHA_ENGINE_URL:-}" ]]; then
    if stored_ca="$(cd "$BACKEND_ROOT" && php artisan settings:get engine-api-ca 2>/dev/null)"; then
        env_ca=""
        [[ -s "$ENGINE_CA_MARKER" ]] && env_ca="$(tr -d '[:space:]' < "$ENGINE_CA_MARKER")"
        if [[ -n "$env_ca" && "$env_ca" == "$(engine_ca_fingerprint "$stored_ca")" ]]; then
            if (cd "$BACKEND_ROOT" && php artisan settings:unset engine-api-ca >/dev/null); then
                rm -f "$ENGINE_CA_MARKER"
                echo "[bootstrap] engine-api-ca cleared - PANELALPHA_ENGINE_URL is delivered without PANELALPHA_ENGINE_CA"
            else
                echo "[bootstrap] engine-api-ca clear failed - check the settings table" >&2
            fi
        else
            rm -f "$ENGINE_CA_MARKER"
            echo "[bootstrap] engine-api-ca kept - set by hand, not from PANELALPHA_ENGINE_CA"
        fi
    else
        rm -f "$ENGINE_CA_MARKER"
    fi
fi
# --- engine certificate: end ---

# --- hub install code: start ---
# The installer's --hub-code (PANELALPHA_HUB_CODE, contract 1.7): claimed once,
# at the first boot, before the first-user step. On the Hub's yes the command
# creates the admin and pairs the panel; on a refusal nothing changes and the
# step below creates the admin from PANELALPHA_USER_* as before. The marker on
# the data volume is written first, so the code is sent at most once, whatever
# the answer and however often the container restarts. The code and the
# password go on stdin, never into argv, and are never logged.
BACKEND_ROOT="${PANELALPHA_BACKEND_ROOT:-/app/backend}"
DATA_ROOT="${PANELALPHA_DATA_ROOT:-/app/data}"
HUB_CODE_MARKER="$DATA_ROOT/hub-install-code-claimed"
if [[ -n "${PANELALPHA_HUB_CODE:-}" && -n "${PANELALPHA_USER_EMAIL:-}" && ! -e "$HUB_CODE_MARKER" ]]; then
    : > "$HUB_CODE_MARKER"
    hub_code_status=0
    printf '%s\n%s\n' "$PANELALPHA_HUB_CODE" "${PANELALPHA_USER_PASSWORD:-}" \
        | (cd "$BACKEND_ROOT" && php artisan hub:claim-install-code "$PANELALPHA_USER_EMAIL" --no-interaction) \
        || hub_code_status=$?
    # HubClaimInstallCodeCommand's exit codes.
    case "$hub_code_status" in
    0) echo "[bootstrap] PanelAlpha install code claimed: the panel is connected" ;;
    2) echo "[bootstrap] PanelAlpha install code refused (exit 2): the admin is created from the env vars; connect later from Settings" ;;
    3) echo "[bootstrap] PanelAlpha install code not sent: a user exists already (exit 3)" ;;
    *) echo "[bootstrap] PanelAlpha install code could not be claimed (exit $hub_code_status)" ;;
    esac
fi
# --- hub install code: end ---

# --- first user: start ---
# Create the single Community user only when the database has none; the env vars are
# ignored once a user exists and the password is never logged. A refused
# creation writes the marker the panel reads
# (SetupState::blocked()): the operator meant this account to exist, so the
# setup wizard must not offer the panel to a visitor instead. The command names
# the rule it refused; its output carries the rule messages, never the password.
BACKEND_ROOT="${PANELALPHA_BACKEND_ROOT:-/app/backend}"
DATA_ROOT="${PANELALPHA_DATA_ROOT:-/app/data}"
FIRST_USER_FAILED_MARKER="$DATA_ROOT/laravel/first-user-creation-failed"
if [[ -n "${PANELALPHA_USER_EMAIL:-}" && -n "${PANELALPHA_USER_PASSWORD:-}" ]]; then
    if (cd "$BACKEND_ROOT" && php artisan users:list --no-interaction 2>/dev/null | grep -q 'No users\.'); then
        if creation_output="$(cd "$BACKEND_ROOT" && php artisan users:create "$PANELALPHA_USER_EMAIL" "$PANELALPHA_USER_PASSWORD" 2>&1)"; then
            rm -f "$FIRST_USER_FAILED_MARKER"
            echo "[bootstrap] first user created"
        else
            mkdir -p "$DATA_ROOT/laravel"
            : > "$FIRST_USER_FAILED_MARKER"
            printf '%s\n' "$creation_output" | sed '/^$/d; s/^/[bootstrap] first user creation failed: /' >&2
            echo "[bootstrap] first user creation failed - fix PANELALPHA_USER_EMAIL / PANELALPHA_USER_PASSWORD or run users:create; the setup wizard stays closed" >&2
        fi
    else
        rm -f "$FIRST_USER_FAILED_MARKER"
    fi
else
    rm -f "$FIRST_USER_FAILED_MARKER"
fi
# --- first user: end ---


# The workers and the scheduler run as www-data; the migration
# above may have created the SQLite file (and its WAL/SHM) as root.
echo "[bootstrap] fix data ownership for www-data"
chown -R www-data:www-data /app/data/laravel
echo "[bootstrap] data ownership OK"

echo "[bootstrap] ensure supervisor storage"
mkdir -p /app/data/supervisor
echo "[bootstrap] supervisor storage OK"

echo "[bootstrap] ensure nginx storage"
mkdir -p /app/data/nginx
echo "[bootstrap] nginx storage OK"

# --- process environment: start ---
# The Engine token and the first-user password have been written into the
# settings table (encrypted, App\Models\Setting) and the user row above, and
# the app reads them only from there; the Hub install code is spent.
# supervisord and every program it starts (Reverb, the queue workers, the
# scheduler; php-fpm already clears its environment) inherit this shell's
# environment, so drop them here: a worker's
# /proc/<pid>/environ never carries them. The Engine delivers them again with
# the container's environment at the next start, which this script reads
# before this point.
unset PANELALPHA_ENGINE_TOKEN PANELALPHA_USER_PASSWORD PANELALPHA_HUB_CODE
# --- process environment: end ---

exec supervisord -c /app/config/supervisord.conf
