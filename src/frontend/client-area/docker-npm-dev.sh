#!/bin/bash
set -ex

cd "$(dirname "$0")"

PUBLIC_HOST=$(curl -s4 icanhazip.com)
ENV_FILE=./.env.dev

DEV_HOST=$(grep ^DEV_HOST= $ENV_FILE | cut -d '=' -f2- | tr -d '\r')
if [ -z "$DEV_HOST" ]; then
    DEV_HOST=$PUBLIC_HOST
fi

DEV_PORT=$(grep ^DEV_PORT= $ENV_FILE | cut -d '=' -f2- | tr -d '\r')
if [ -z "$DEV_PORT" ]; then
    DEV_PORT=2140
fi

API_HOST=$(grep ^API_HOST= $ENV_FILE | cut -d '=' -f2- | tr -d '\r')
if [ -z "$API_HOST" ]; then
    API_HOST=$PUBLIC_HOST
fi

API_PORT=$(grep ^API_PORT= $ENV_FILE | cut -d '=' -f2- | tr -d '\r')
if [ -z "$API_PORT" ]; then
    API_PORT=8443
fi

# API_PROXY (e.g. https://panel.example.com): Vite proxies /api and /ws to that panel (same origin in the browser);
# API_HOST / API_PORT are then not used, and the websocket defaults to the dev server.
API_PROXY=$(grep ^API_PROXY= $ENV_FILE | cut -d '=' -f2- | tr -d '\r')
if [ -n "$API_PROXY" ]; then
    API_HOST=$DEV_HOST
    API_PORT=$DEV_PORT
fi

WEBSOCKET_HOST=$(grep ^WEBSOCKET_HOST= $ENV_FILE | cut -d '=' -f2- | tr -d '\r')
if [ -z "$WEBSOCKET_HOST" ]; then
    WEBSOCKET_HOST=$API_HOST
fi

WEBSOCKET_PORT=$(grep ^WEBSOCKET_PORT= $ENV_FILE | cut -d '=' -f2- | tr -d '\r')
if [ -z "$WEBSOCKET_PORT" ]; then
    WEBSOCKET_PORT=$API_PORT
fi

API_URL=https://$API_HOST:$API_PORT/api
if [ -n "$API_PROXY" ]; then
    API_URL=/api
fi

TTY_FLAGS=(-i)
if [ -t 0 ]; then
    TTY_FLAGS=(-it)
fi

docker run -v .:/app -w /app --rm "${TTY_FLAGS[@]}" --pid=host \
    -u "$(id -u):$(id -g)" \
    -p $DEV_PORT:$DEV_PORT \
    -e VITE_API_URL=$API_URL \
    -e VITE_WEBSOCKET_HOST=$WEBSOCKET_HOST \
    -e VITE_WEBSOCKET_PORT=$WEBSOCKET_PORT \
    -e DEV_HOST=$DEV_HOST \
    -e DEV_PORT=$DEV_PORT \
    -e API_PROXY=$API_PROXY \
    node:24 \
    bash -c 'set -e
      if echo "$DEV_HOST" | grep -Eq "^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$"; then
        SAN="IP:${DEV_HOST}"
      else
        SAN="DNS:${DEV_HOST}"
      fi
      openssl req -x509 -newkey rsa:2048 \
        -keyout /tmp/dev-key.pem \
        -out /tmp/dev-cert.pem \
        -days 30 -nodes \
        -subj "/CN=${DEV_HOST}" \
        -addext "subjectAltName=${SAN}"
      export DEV_HTTPS_KEY=/tmp/dev-key.pem
      export DEV_HTTPS_CERT=/tmp/dev-cert.pem
      exec ./node_modules/.bin/vite --host 0.0.0.0 --port "$DEV_PORT" --strictPort
    '
