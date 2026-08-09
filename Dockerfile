FROM node:26-alpine AS frontend-builder
WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:26-alpine AS runtime
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./
COPY --from=frontend-builder /build/client/dist ./public

RUN apk add --no-cache docker-cli docker-cli-compose && mkdir -p /data

EXPOSE 3000

HEALTHCHECK --interval=60s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/version >/dev/null || exit 1

# Runs as root on purpose: self-update drives the mounted docker socket, which is
# root-equivalent anyway, so a non-root user would break updates without
# reducing the blast radius.
CMD ["node", "server.js"]
