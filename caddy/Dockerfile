# Stage 1: build the dashboard
# The lockfile is copied so builds are reproducible; without it bun re-resolves
# every caret range and a minor can land in production uncommitted.
FROM oven/bun:1 AS builder
WORKDIR /app
COPY dashboard/package.json dashboard/bun.lock ./
RUN bun install --frozen-lockfile

COPY dashboard/ .
RUN bun run build

# Stage 2: Caddy serves the built files
FROM caddy:2-alpine
COPY --from=builder /app/dist /srv
COPY caddy/Caddyfile /etc/caddy/Caddyfile
