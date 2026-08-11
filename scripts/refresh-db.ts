// scripts/refresh-db.ts -- copies production into dev. One direction, always.
// Dev ends up an exact copy of prod; nothing is applied on top. 
// The Postgres tools run in a throwaway container.

const IMAGE = process.env.PG_IMAGE ?? "postgres:18.3";
const DUMP = "/tmp/prod.dump";

const prod = process.env.PROD_DATABASE_URL;
if (!prod) throw new Error("PROD_DATABASE_URL is not set");
const dev = process.env.DATABASE_URL;
if (!dev) throw new Error("DATABASE_URL is not set");

const prodUrl = new URL(prod);
const devUrl = new URL(dev);

if (prodUrl.host === devUrl.host)
  throw new Error(`DATABASE_URL is on the same server as production (${devUrl.host}) -- refusing to drop anything there`);

const devDb = decodeURIComponent(devUrl.pathname.slice(1));
if (!devDb) throw new Error("DATABASE_URL has no database name");

// Inside the container, localhost is the container.
const reachable = (url: URL) => {
  const u = new URL(url);
  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname)) u.hostname = "host.docker.internal";
  return u;
};

const devTarget = reachable(devUrl);
// dropdb and createdb cannot be connected to the database they operate on.
const maintenance = new URL(devTarget);
maintenance.pathname = "/postgres";

// URLs go through the environment to keep the passwords out of argv.
const run = (env: Record<string, string>, script: string, quiet = false) =>
  Bun.spawnSync(
    [
      "docker", "run", "--rm",
      "--add-host", "host.docker.internal:host-gateway",
      ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
      IMAGE, "sh", "-c", script,
    ],
    quiet ? { stdout: "ignore", stderr: "pipe" } : { stdout: "inherit", stderr: "inherit" },
  );

const ping = run({ MAINT: maintenance.toString() }, 'psql "$MAINT" -Atc "select 1"', true);
if (ping.exitCode !== 0) {
  const detail = ping.stderr.toString().split("\n").map((l) => l.trim()).filter(Boolean).join(" ");
  throw new Error(`Dev database is not reachable${detail ? `: ${detail}` : ""}`);
}

console.log(`Refreshing ${devDb} on ${devUrl.host} from ${prodUrl.host}`);

// One container for all four steps, so the dump lives and dies in its /tmp.
// set -e is what keeps a failed dump from reaching the drop.
const { exitCode } = run(
  {
    PROD: prod,
    DEV: devTarget.toString(),
    MAINT: maintenance.toString(),
    DEVDB: devDb,
  },
  [
    "set -e",
    'echo "> Dumping production"',
    `pg_dump --no-owner --no-privileges -Fc "$PROD" -f ${DUMP}`,
    'echo "> Dropping dev database"',
    'dropdb --maintenance-db="$MAINT" --force --if-exists "$DEVDB"',
    'echo "> Creating dev database"',
    'createdb --maintenance-db="$MAINT" "$DEVDB"',
    'echo "> Restoring"',
    `pg_restore -d "$DEV" --no-owner -j 4 ${DUMP}`,
  ].join("\n"),
);
if (exitCode !== 0) throw new Error(`Refresh failed (exit ${exitCode})`);

console.log(`\nDone. ${devDb} now mirrors production.`);
