#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/srv/99freelas-mcp-server}"
SERVICE_NAME="${SERVICE_NAME:-99freelas-mcp-server}"
IMAGE_NAME="${IMAGE_NAME:-99freelas-mcp-server}"
NETWORK_NAME="${NETWORK_NAME:-easypanel}"
STACK_HOSTNAME="${MCP_HOSTNAME:-}"

if [[ -z "${STACK_HOSTNAME}" ]]; then
  echo "MCP_HOSTNAME is required. Set it in /srv/99freelas-mcp-server/deploy.env or export it before running." >&2
  exit 1
fi

if [[ ! -f "${DEPLOY_DIR}/deploy.env" ]]; then
  echo "Missing deploy env file: ${DEPLOY_DIR}/deploy.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${DEPLOY_DIR}/deploy.env"
set +a

mkdir -p "${DEPLOY_DIR}/data"

docker build \
  -t "${IMAGE_NAME}:${GITHUB_SHA:-local}" \
  -t "${IMAGE_NAME}:latest" \
  .

if docker service inspect "${SERVICE_NAME}" >/dev/null 2>&1; then
  docker service rm "${SERVICE_NAME}"
  while docker service inspect "${SERVICE_NAME}" >/dev/null 2>&1; do
    sleep 2
  done
fi

http_rule_label="traefik.http.routers.${SERVICE_NAME}-http.rule=Host(\`${STACK_HOSTNAME}\`)"
https_rule_label="traefik.http.routers.${SERVICE_NAME}-https.rule=Host(\`${STACK_HOSTNAME}\`)"

docker service create \
  --name "${SERVICE_NAME}" \
  --replicas 1 \
  --constraint node.role==manager \
  --network "${NETWORK_NAME}" \
  --mount type=bind,src="${DEPLOY_DIR}/data",dst=/app/.data \
  --env HOST=0.0.0.0 \
  --env PORT=3000 \
  --env MCP_HTTP_PATH=/mcp \
  --env STATE_DB_FILE=/app/.data/state.sqlite \
  --env STATE_DB_JOURNAL_MODE=DELETE \
  --env SESSION_FILE=/app/.data/sessions.json \
  --env CACHE_FILE=/app/.data/cache.json \
  --env AUDIT_LOG_FILE=/app/.data/audit.log \
  --env MANUAL_COOKIES_FILE=/app/.data/manual-cookies.json \
  --env LOG_LEVEL=info \
  --env LOG_FILE=/app/.data/server.log \
  --env LOG_STDERR=false \
  --env SESSION_ENCRYPTION_KEY_BASE64="${SESSION_ENCRYPTION_KEY_BASE64}" \
  --env NINETY_NINE_BASE_URL="${NINETY_NINE_BASE_URL:-https://www.99freelas.com.br}" \
  --env ALLOW_MANUAL_COOKIE_FALLBACK="${ALLOW_MANUAL_COOKIE_FALLBACK:-false}" \
  --label traefik.enable=true \
  --label "traefik.docker.network=${NETWORK_NAME}" \
  --label "traefik.http.services.${SERVICE_NAME}.loadbalancer.server.port=3000" \
  --label "${http_rule_label}" \
  --label "traefik.http.routers.${SERVICE_NAME}-http.entrypoints=http" \
  --label "traefik.http.routers.${SERVICE_NAME}-http.middlewares=redirect-to-https@file" \
  --label "${https_rule_label}" \
  --label "traefik.http.routers.${SERVICE_NAME}-https.entrypoints=https" \
  --label "traefik.http.routers.${SERVICE_NAME}-https.tls=true" \
  --label "traefik.http.routers.${SERVICE_NAME}-https.tls.certresolver=letsencrypt" \
  "${IMAGE_NAME}:${GITHUB_SHA:-local}"
