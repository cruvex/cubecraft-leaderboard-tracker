# Stage 1: build the dashboard
FROM oven/bun:1 AS builder
WORKDIR /app
COPY dashboard/package.json ./
RUN bun install
COPY dashboard/ .
RUN bun run build

# Stage 2: Caddy serves the built files
FROM caddy:2-alpine
COPY --from=builder /app/dist /srv
COPY caddy/Caddyfile /etc/caddy/Caddyfile