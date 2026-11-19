# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --ignore-scripts

FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY web web
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN apt-get update && apt-get install -y --no-install-recommends gosu \n && rm -rf /var/lib/apt/lists/*
RUN npm ci --omit=dev --ignore-scripts --workspace=@quotation/shared --workspace=@quotation/server

COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && mkdir -p /app/data

# 8766: main HTTP port. 8767: optional bundled self-signed HTTPS listener for Twitch OAuth
# on deployments with no reverse-proxy TLS termination — only used if TLS_PORT is set.
EXPOSE 8766 8767
VOLUME /app/data

# No dedicated health route; /api/auth/me answers 200 without a session. Any response < 500 means the server is up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8766) + '/api/auth/me').then(r => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"

# Starts as root only to chown the bind-mounted data dir, then drops to uid 99:100 via gosu.
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server/dist/index.js"]
