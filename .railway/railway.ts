import {
  defineRailway,
  github,
  postgres,
  project,
  service,
  volume,
} from "railway/iac";

const REGION = "europe-west4-drams3a";
const REPO = "cruvex/cubecraft-leaderboard-tracker";

// Explicit so api's listen port and Caddy's proxy target cannot drift apart.
const API_PORT = 8080;

// Only the volume declares a region; omitting it there unsets it, unlike services.
export default defineRailway((ctx) => {
  // Both hostnames below are globally unique in Railway, so a non-prod
  // environment must not claim them or it takes them off production.
  const isProd = ctx.isEnvironment("production");

  // Temporary: lets non-prod build scraper/Dockerfile before it reaches main.
  const BRANCH = isProd ? "main" : "feat/railway-IaC";

  const db = postgres("Postgres");

  const pgData = volume("postgres-volume", {
    sizeMB: 5000,
    region: REGION,
    allowOnlineResize: true,
  });

  const api = service("api", {
    source: github(REPO, { branch: BRANCH }),
    rootDirectory: "/",
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "/api/Dockerfile",
      watchPatterns: ["/api/**"],
    },
    start: "bun run start",
    preDeploy: "bun run migrate",
    healthcheck: "/api/healthz",
    // Declared, or Railway reports a networking diff on every plan.
    networking: { privateNetworkEndpoint: "api" },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      PORT: String(API_PORT),
    },
  });

  // NEVER restart: a finished cron run would otherwise be treated as a crash.
  const scraper = service("scraper", {
    source: github(REPO, { branch: BRANCH }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "/scraper/Dockerfile",
      watchPatterns: ["/scraper/**"],
    },
    deploy: {
      // 30 February never occurs, so non-prod is scheduled but never fires.
      cronSchedule: isProd ? "*/15 * * * *" : "0 0 30 2 *",
      restartPolicyType: "NEVER",
    },
    networking: { privateNetworkEndpoint: "scraper" },
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
    },
  });

  const dashboard = service("dashboard", {
    source: github(REPO, { branch: BRANCH }),
    rootDirectory: "/",
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "/caddy/Dockerfile",
      watchPatterns: ["/caddy/**", "/dashboard/**"],
    },
    domains: isProd ? [{ domain: "cubecraftplus.net", port: 80 }] : undefined,
    networking: {
      privateNetworkEndpoint: "dashboard",
      serviceDomains: {
        [isProd ? "cubestats.up.railway.app" : "cubestats-dev.up.railway.app"]:
          { port: 80 },
      },
    },
    env: {
      // Not api.env.RAILWAY_PRIVATE_DOMAIN: that is an object, not a string.
      BACKEND_URL: "${{" + api.name + ".RAILWAY_PRIVATE_DOMAIN}}:" + API_PORT,
    },
  });

  return project("CubeCraft", {
    resources: [db, pgData, api, scraper, dashboard],
  });
});
