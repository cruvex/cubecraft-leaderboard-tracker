import { startHealthServer } from "./health";
import { Scheduler } from "./scheduler";
import { leaderboards } from "./tasks/leaderboards";

// Scheduling lives here because Railway cron cannot run more often than every 5 minutes.

// Checked at boot rather than on the first run, which could be 15 minutes away.
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const scheduler = new Scheduler([leaderboards]);
scheduler.start();

const health = startHealthServer(scheduler);

let stopping = false;

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;

    console.log(`${signal} received, shutting down`);
    await health.stop();
    await scheduler.stop();
    process.exit(0);
  });
}

// Logged but not fatal: killing the process would take every other task down with it.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

// Unknown state after this, so let Railway restart rather than keep scheduling on top of it.
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception, exiting:", err);
  process.exit(1);
});
