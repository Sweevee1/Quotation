# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

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
RUN npm ci --omit=dev --workspace=@quotation/shared --workspace=@quotation/server

COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist

EXPOSE 8766
VOLUME /app/data
CMD ["node", "server/dist/index.js"]
