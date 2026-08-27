# Stage 1: bundle the scraper and its dependencies into one file.
# Bun transpiles every module it imports at startup, and zod's module graph is
# most of what this process does. Bundling ahead of time hands the runtime one
# tree-shaken file instead, which roughly halves both: 31MB -> 17MB peak, and a
# 192MB image -> 103MB.
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY scraper/package.json scraper/bun.lock ./
RUN bun install --frozen-lockfile

COPY scraper/src src
# --sourcemap=inline because --minify mangles stack traces, and report.ts posts
# error.stack to Discord -- the only visibility into a process that now runs
# unattended rather than one cron invocation at a time.
RUN bun build src/index.ts --target=bun --minify --sourcemap=inline --outfile=scraper.js

# Stage 2: the bundle carries its dependencies, so node_modules never ships.
FROM oven/bun:1-alpine
WORKDIR /app
COPY --from=builder /app/scraper.js .
USER bun
CMD ["bun", "scraper.js"]
