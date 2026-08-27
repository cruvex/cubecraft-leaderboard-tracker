import type { Scheduler } from "./scheduler";

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// Liveness only: a failed healthcheck restarts the service, which cannot fix an upstream outage.
export function startHealthServer(scheduler: Scheduler) {
  const server = Bun.serve({
    port,
    hostname: "0.0.0.0",
    routes: {
      "/healthz": () =>
        Response.json({
          status: "ok",
          uptimeSeconds: Math.round(process.uptime()),
          tasks: scheduler.snapshot(),
        }),
    },
    fetch: () => new Response("Not found", { status: 404 }),
  });

  console.log(`Health server listening on http://0.0.0.0:${port}/healthz`);

  return server;
}
