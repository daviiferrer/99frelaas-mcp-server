# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package*.json ./
RUN npm ci --ignore-scripts

FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
COPY scripts ./scripts
COPY README.md ./
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends git docker.io ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --ignore-scripts --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/README.md ./README.md
COPY data ./data
RUN mkdir -p /app/.data \
  && chown -R node:node /app

# MCP Streamable HTTP server entrypoint for container hosts such as Render.
CMD ["node", "dist/http.js"]
