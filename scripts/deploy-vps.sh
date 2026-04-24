#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/srv/99freelas-mcp-server}"
SERVICE_NAME="${SERVICE_NAME:-99freelas-mcp-server}"
IMAGE_NAME="${IMAGE_NAME:-99freelas-mcp-server}"
NETWORK_NAME="${NETWORK_NAME:-easypanel}"

if [[ ! -f "${DEPLOY_DIR}/deploy.env" ]]; then
  echo "Missing deploy env file: ${DEPLOY_DIR}/deploy.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${DEPLOY_DIR}/deploy.env"
set +a

STACK_HOSTNAME="${MCP_HOSTNAME:-}"
WEBHOOK_PATH="${GITHUB_WEBHOOK_PATH:-/webhooks/github}"
DEPLOY_BRANCH="${GITHUB_WEBHOOK_BRANCH:-master}"
WEBHOOK_HOSTNAME="${GITHUB_WEBHOOK_HOSTNAME:-webhook.${STACK_HOSTNAME}}"

if [[ -z "${STACK_HOSTNAME}" ]]; then
  echo "MCP_HOSTNAME is required. Set it in /srv/99freelas-mcp-server/deploy.env or export it before running." >&2
  exit 1
fi

if [[ -z "${GITHUB_WEBHOOK_SECRET:-}" ]]; then
  echo "GITHUB_WEBHOOK_SECRET is required. Set it in /srv/99freelas-mcp-server/deploy.env." >&2
  exit 1
fi

cd "${DEPLOY_DIR}"

if [[ ! -d .git ]]; then
  echo "Missing git repository in ${DEPLOY_DIR}. Clone the repo there first." >&2
  exit 1
fi

mkdir -p "${DEPLOY_DIR}/data"

git fetch origin "${DEPLOY_BRANCH}"
git reset --hard "origin/${DEPLOY_BRANCH}"

BUILD_TAG="${GITHUB_SHA:-local}"

docker build \
  -t "${IMAGE_NAME}:${BUILD_TAG}" \
  -t "${IMAGE_NAME}:latest" \
  .

main_http_rule_label="$(printf 'traefik.http.routers.%s-http.rule=Host(`%s`)' "${SERVICE_NAME}" "${STACK_HOSTNAME}")"
main_https_rule_label="$(printf 'traefik.http.routers.%s-https.rule=Host(`%s`)' "${SERVICE_NAME}" "${STACK_HOSTNAME}")"
webhook_rule_label="$(printf 'traefik.http.routers.%s-webhook.rule=Host(`%s`) && Path(`%s`)' "${SERVICE_NAME}" "${WEBHOOK_HOSTNAME}" "${WEBHOOK_PATH}")"

service_exists=false
if docker service inspect "${SERVICE_NAME}" >/dev/null 2>&1; then
  service_exists=true
fi

current_ports=""
if [[ "${service_exists}" == "true" ]]; then
  current_ports="$(docker service inspect "${SERVICE_NAME}" --format '{{json .Endpoint.Ports}}')"
fi

recreate_service=false
if [[ "${current_ports}" == *"\"TargetPort\":3000"* ]]; then
  recreate_service=true
fi

if [[ "${service_exists}" == "true" && "${recreate_service}" == "true" ]]; then
  docker service rm "${SERVICE_NAME}"
  until ! docker service inspect "${SERVICE_NAME}" >/dev/null 2>&1; do
    sleep 1
  done
  service_exists=false
fi

if [[ "${service_exists}" == "true" ]]; then
  docker service update \
    --image "${IMAGE_NAME}:${BUILD_TAG}" \
    --force \
    --env-add "GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET}" \
    --env-add "GITHUB_WEBHOOK_PATH=${WEBHOOK_PATH}" \
    --env-add "GITHUB_WEBHOOK_BRANCH=${DEPLOY_BRANCH}" \
    --env-add "GITHUB_WEBHOOK_REPOSITORY=${GITHUB_WEBHOOK_REPOSITORY:-daviiferrer/99frelaas-mcp-server}" \
    --env-add "GITHUB_WEBHOOK_HOSTNAME=${WEBHOOK_HOSTNAME}" \
    --env-add "DEPLOY_REPO_DIR=/repo" \
    --env-add "DEPLOY_SCRIPT_PATH=/repo/scripts/deploy-vps.sh" \
    --label-add "traefik.enable=true" \
    --label-add "traefik.docker.network=${NETWORK_NAME}" \
    --label-add "traefik.http.services.${SERVICE_NAME}.loadbalancer.server.port=3000" \
    --label-add "${main_http_rule_label}" \
    --label-add "${main_https_rule_label}" \
    --label-add "traefik.http.routers.${SERVICE_NAME}-webhook.entrypoints=https" \
    --label-add "traefik.http.routers.${SERVICE_NAME}-http.service=${SERVICE_NAME}" \
    --label-add "traefik.http.routers.${SERVICE_NAME}-https.service=${SERVICE_NAME}" \
    --label-add "traefik.http.routers.${SERVICE_NAME}-webhook.tls=true" \
    --label-add "traefik.http.routers.${SERVICE_NAME}-webhook.tls.certresolver=letsencrypt" \
    --label-add "traefik.http.routers.${SERVICE_NAME}-webhook.priority=100" \
    --label-add "traefik.http.routers.${SERVICE_NAME}-webhook.service=${SERVICE_NAME}" \
    --label-add "${webhook_rule_label}" \
    --container-label-add "traefik.enable=true" \
    --container-label-add "traefik.docker.network=${NETWORK_NAME}" \
    --container-label-add "traefik.http.services.${SERVICE_NAME}.loadbalancer.server.port=3000" \
    --container-label-add "${main_http_rule_label}" \
    --container-label-add "traefik.http.routers.${SERVICE_NAME}-http.entrypoints=http" \
    --container-label-add "traefik.http.routers.${SERVICE_NAME}-http.service=${SERVICE_NAME}" \
    --container-label-add "traefik.http.routers.${SERVICE_NAME}-http.middlewares=redirect-to-https@file" \
    --container-label-add "${main_https_rule_label}" \
    --container-label-add "traefik.http.routers.${SERVICE_NAME}-https.entrypoints=https" \
    --container-label-add "traefik.http.routers.${SERVICE_NAME}-https.service=${SERVICE_NAME}" \
    --container-label-add "traefik.http.routers.${SERVICE_NAME}-https.tls=true" \
    --container-label-add "traefik.http.routers.${SERVICE_NAME}-https.tls.certresolver=letsencrypt" \
    --container-label-add "traefik.http.routers.${SERVICE_NAME}-webhook.entrypoints=https" \
    --container-label-add "traefik.http.routers.${SERVICE_NAME}-webhook.tls=true" \
    --container-label-add "traefik.http.routers.${SERVICE_NAME}-webhook.tls.certresolver=letsencrypt" \
    --container-label-add "traefik.http.routers.${SERVICE_NAME}-webhook.priority=100" \
    --container-label-add "traefik.http.routers.${SERVICE_NAME}-webhook.service=${SERVICE_NAME}" \
    --container-label-add "${webhook_rule_label}" \
    "${SERVICE_NAME}"
else
  docker service create \
    --name "${SERVICE_NAME}" \
    --replicas 1 \
    --constraint node.role==manager \
    --network "${NETWORK_NAME}" \
    --mount type=bind,src="${DEPLOY_DIR}/data",dst=/app/.data \
    --mount type=bind,src="${DEPLOY_DIR}",dst=/repo \
    --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
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
    --env GITHUB_WEBHOOK_SECRET="${GITHUB_WEBHOOK_SECRET:-}" \
    --env GITHUB_WEBHOOK_PATH="${WEBHOOK_PATH}" \
    --env GITHUB_WEBHOOK_BRANCH="${DEPLOY_BRANCH}" \
    --env GITHUB_WEBHOOK_REPOSITORY="${GITHUB_WEBHOOK_REPOSITORY:-daviiferrer/99frelaas-mcp-server}" \
    --env GITHUB_WEBHOOK_HOSTNAME="${WEBHOOK_HOSTNAME}" \
    --env DEPLOY_REPO_DIR=/repo \
    --env DEPLOY_SCRIPT_PATH=/repo/scripts/deploy-vps.sh \
    --label traefik.enable=true \
    --label "traefik.docker.network=${NETWORK_NAME}" \
    --label "traefik.http.services.${SERVICE_NAME}.loadbalancer.server.port=3000" \
    --label "${main_http_rule_label}" \
    --label "traefik.http.routers.${SERVICE_NAME}-http.entrypoints=http" \
    --label "traefik.http.routers.${SERVICE_NAME}-http.service=${SERVICE_NAME}" \
    --label "traefik.http.routers.${SERVICE_NAME}-http.middlewares=redirect-to-https@file" \
    --label "${main_https_rule_label}" \
    --label "traefik.http.routers.${SERVICE_NAME}-https.entrypoints=https" \
    --label "traefik.http.routers.${SERVICE_NAME}-https.service=${SERVICE_NAME}" \
    --label "traefik.http.routers.${SERVICE_NAME}-https.tls=true" \
    --label "traefik.http.routers.${SERVICE_NAME}-https.tls.certresolver=letsencrypt" \
    --label "traefik.http.routers.${SERVICE_NAME}-webhook.entrypoints=https" \
    --label "traefik.http.routers.${SERVICE_NAME}-webhook.tls=true" \
    --label "traefik.http.routers.${SERVICE_NAME}-webhook.tls.certresolver=letsencrypt" \
    --label "traefik.http.routers.${SERVICE_NAME}-webhook.priority=100" \
    --label "traefik.http.routers.${SERVICE_NAME}-webhook.service=${SERVICE_NAME}" \
    --label "${webhook_rule_label}" \
    --container-label traefik.enable=true \
    --container-label "traefik.docker.network=${NETWORK_NAME}" \
    --container-label "traefik.http.services.${SERVICE_NAME}.loadbalancer.server.port=3000" \
    --container-label "${main_http_rule_label}" \
    --container-label "traefik.http.routers.${SERVICE_NAME}-http.entrypoints=http" \
    --container-label "traefik.http.routers.${SERVICE_NAME}-http.service=${SERVICE_NAME}" \
    --container-label "traefik.http.routers.${SERVICE_NAME}-http.middlewares=redirect-to-https@file" \
    --container-label "${main_https_rule_label}" \
    --container-label "traefik.http.routers.${SERVICE_NAME}-https.entrypoints=https" \
    --container-label "traefik.http.routers.${SERVICE_NAME}-https.service=${SERVICE_NAME}" \
    --container-label "traefik.http.routers.${SERVICE_NAME}-https.tls=true" \
    --container-label "traefik.http.routers.${SERVICE_NAME}-https.tls.certresolver=letsencrypt" \
    --container-label "traefik.http.routers.${SERVICE_NAME}-webhook.entrypoints=https" \
    --container-label "traefik.http.routers.${SERVICE_NAME}-webhook.tls=true" \
    --container-label "traefik.http.routers.${SERVICE_NAME}-webhook.tls.certresolver=letsencrypt" \
    --container-label "traefik.http.routers.${SERVICE_NAME}-webhook.priority=100" \
    --container-label "traefik.http.routers.${SERVICE_NAME}-webhook.service=${SERVICE_NAME}" \
    --container-label "${webhook_rule_label}" \
    "${IMAGE_NAME}:${BUILD_TAG}"
fi
