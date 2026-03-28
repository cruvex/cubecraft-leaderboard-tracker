// Simple Bun-based dashboard server for leaderboard visualization
// Place this file at: cube-leaderboard-tracker/dashboard/server.ts
//
// Usage:
//   bun run dashboard/server.ts
//
// This server serves a small frontend (dashboard/public) and exposes a
// few API endpoints that run the SQL queries you provided.
//
// Endpoints:
//   GET  /api/top-gainers
//   GET  /api/player/:uuid/score_gain
//   GET  /api/player/:uuid/scores
//
// The server uses the global `Bun.sql` API (same as your `main.ts`). Make sure
// your environment/database configuration is available to Bun when starting
// the server.
import { fileURLToPath } from "bun";
import { join } from "path";
import * as db from "./db";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const publicDir = fileURLToPath(new URL("public/", import.meta.url));

// Utility helpers
function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Resolve an ID which could be a UUID or an IGN to a UUID.
 */
async function resolvePlayerId(id: string): Promise<string> {
  const isUuid = id.length >= 32 && (id.includes("-") || id.length === 32);
  if (!isUuid) {
    const resolvedUuid = await db.getUuidByIgn(id);
    if (resolvedUuid) return resolvedUuid;
  }
  return id;
}

// Main server
Bun.serve({
  port: PORT,
  routes: {
    "/api/top-gainers": async (req) => {
      const url = new URL(req.url);
      const days = Number(url.searchParams.get("days") || 30);
      const gameId = url.searchParams.get("gameId") ? Number(url.searchParams.get("gameId")) : undefined;
      const out = await db.getTopGainers(days, 50, gameId);
      return jsonResponse(out);
    },
    "/api/player/:id/score_gain": async (req) => {
      const id = await resolvePlayerId(req.params.id);
      const url = new URL(req.url);
      const days = Number(url.searchParams.get("days") || 30);
      const gameId = url.searchParams.get("gameId") ? Number(url.searchParams.get("gameId")) : undefined;
      const data = await db.getPlayerGain(id, days, gameId);
      if (!data) return jsonResponse({ error: "Player not found" }, 404);
      return jsonResponse(data);
    },
    "/api/player/:id/scores": async (req) => {
      const id = await resolvePlayerId(req.params.id);
      const url = new URL(req.url);
      const days = Number(url.searchParams.get("days") || 30);
      const gameId = url.searchParams.get("gameId") ? Number(url.searchParams.get("gameId")) : undefined;
      const data = await db.getPlayerScores(id, days, gameId);
      return jsonResponse(data);
    },
    "/api/games": async () => {
      const games = await db.fetchGames();
      return jsonResponse(games);
    },
    // Static files
    "/": Bun.file(join(publicDir, "index.html")),
    "/index.html": Bun.file(join(publicDir, "index.html")),
    "/app.js": Bun.file(join(publicDir, "app.js")),
    "/favicon.ico": Bun.file(join(publicDir, "favicon.ico")),
  },
  async fetch(req: Request) {
    // If we reach here, no static or api route matched
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Dashboard server running at http://localhost:${PORT}`);
