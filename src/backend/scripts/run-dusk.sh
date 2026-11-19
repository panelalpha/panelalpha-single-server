#!/usr/bin/env bash
#
# Run the ported Client Area Dusk suite against a live v1 panel.
#
# Both processes run in containers, so the host needs only Docker:
# Chrome in selenium/standalone-chrome, reached through
# DUSK_DRIVER_URL, and the suite itself in the composer:2 image the hermetic
# gate already uses (PHP 8.5). This is NOT part of the hermetic gate:
# `php artisan test` uses phpunit.xml, which has no Browser testsuite.
#
# Usage:
#   DUSK_BASE_URL=http://localhost:9180 \
#   DUSK_USER_FILE=/path/to/test-user \
#   src/backend/scripts/run-dusk.sh [extra phpunit args]
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

DOCKER="${DOCKER:-docker}"
CHROME_IMAGE="${DUSK_CHROME_IMAGE:-selenium/standalone-chrome:latest}"
CHROME_NAME="${DUSK_CHROME_NAME:-panelalpha-dusk-chrome}"
DRIVER_PORT="${DUSK_DRIVER_PORT:-4444}"
WAIT_SECONDS="${DUSK_DRIVER_WAIT_SECONDS:-60}"
PHP_IMAGE="${DUSK_PHP_IMAGE:-composer:2}"
APP_KEY="${APP_KEY:-base64:MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=}"

if [[ -z "${DUSK_DRIVER_URL:-}" ]]; then
    export DUSK_DRIVER_URL="http://127.0.0.1:${DRIVER_PORT}"
fi

cleanup() {
    "${DOCKER}" rm -f "${CHROME_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[dusk] starting ${CHROME_IMAGE} as ${CHROME_NAME}"
"${DOCKER}" run -d --rm --name "${CHROME_NAME}" --network host \
    -e SE_NODE_MAX_SESSIONS="${DUSK_CHROME_MAX_SESSIONS:-1}" \
    "${CHROME_IMAGE}" >/dev/null

if (( WAIT_SECONDS > 0 )); then
    echo "[dusk] waiting for ${DUSK_DRIVER_URL}"
    for ((i = 0; i < WAIT_SECONDS; i++)); do
        if curl -fsS "${DUSK_DRIVER_URL}/wd/hub/status" >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done
fi

# The suite runs in its own container on the host network so it reaches both
# the Chrome driver (`127.0.0.1:${DRIVER_PORT}`) and the panel
# (`DUSK_BASE_URL`). The user file is mounted at its host path so the value
# the caller passed stays valid inside the container.
php_env=(-e "APP_KEY=${APP_KEY}" -e "DUSK_DRIVER_URL=${DUSK_DRIVER_URL}")
php_mounts=(-v "${PWD}:/app" -w /app)
if [[ -n "${DUSK_BASE_URL:-}" ]]; then
    php_env+=(-e "DUSK_BASE_URL=${DUSK_BASE_URL}")
fi
if [[ -n "${DUSK_USER_FILE:-}" ]]; then
    php_env+=(-e "DUSK_USER_FILE=${DUSK_USER_FILE}")
fi
if [[ -n "${DUSK_USER_FILE:-}" && -f "${DUSK_USER_FILE}" ]]; then
    php_mounts+=(-v "${DUSK_USER_FILE}:${DUSK_USER_FILE}:ro")
fi

echo "[dusk] running the Dusk suite against ${DUSK_BASE_URL:-<DUSK_BASE_URL unset>}"
"${DOCKER}" run --rm --network host \
    -u "$(id -u):$(id -g)" \
    "${php_mounts[@]}" "${php_env[@]}" \
    "${PHP_IMAGE}" php artisan dusk "$@"
