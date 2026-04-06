FROM node:20-alpine AS frontend-builder
WORKDIR /build/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

COPY server/package*.json ./
RUN npm install --omit=dev

COPY server/ ./
COPY --from=frontend-builder /build/client/dist ./public

RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "server.js"]
