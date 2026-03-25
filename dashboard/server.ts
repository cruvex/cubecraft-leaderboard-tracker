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

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const publicDir = new URL("public/", import.meta.url);

// Utility helpers
function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Try to safely read a public file path under ./public. Returns a Response
 * containing the file if it exists, or throws.
 */
function servePublicFile(pathname: string): Response {
  // Normalize and prevent directory traversal by resolving relative to publicDir.
  const url = new URL("." + pathname, publicDir);
  // console.log("Serve public file:", url);
  try {
    return new Response(Bun.file(url.pathname));
  } catch (err) {
    throw new Error("Public file not found: " + pathname);
  }
}

// Main server
Bun.serve({
  port: PORT,
  async fetch(req: Request) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    try {
      // Root / -> serve index.html
      if (pathname === "/" || pathname === "/index.html") {
        return servePublicFile("/index.html");
      }

      // Serve static files from public root (e.g. /app.js, /styles.css)
      if (
        pathname.startsWith("/app.js") ||
        pathname.startsWith("/styles.css")
      ) {
        try {
          return servePublicFile(pathname);
        } catch {
          return textResponse("Not found", 404);
        }
      }

      // API routes
      if (pathname.startsWith("/api/")) {
        // Route: GET /api/top-gainers
        if (pathname === "/api/top-gainers" && req.method === "GET") {
          // Query: top 20 players by score_gain in last 30 days
          const res = await Bun.sql`
            WITH scores AS (
              SELECT
                lr.player,
                MAX(lr.score) - MIN(lr.score) AS score_gain
              FROM leaderboard_rows lr
              JOIN leaderboard_snapshots ls ON lr.snapshot_id = ls.id
              WHERE ls.timestamp >= NOW() - INTERVAL '30 days'
              GROUP BY lr.player
            )
            SELECT * FROM scores
            ORDER BY score_gain DESC
            LIMIT 20
          `;

          const out = (res || []).map((r: any) => ({
            player: r.player,
            // Ensure numeric conversion; some drivers return BigInt-like or strings.
            score_gain: r.score_gain == null ? 0 : Number(r.score_gain),
          }));

          return jsonResponse(out);
        }

        // Player routes: /api/player/:uuid/...
        const parts = pathname.split("/").filter(Boolean); // ['api','player','{uuid}',...]
        if (parts.length >= 3 && parts[0] === "api" && parts[1] === "player") {
          const uuid = decodeURIComponent(parts[2]);

          // GET /api/player/:uuid/score_gain
          if (parts[3] === "score_gain" && req.method === "GET") {
            const res = await Bun.sql`
              WITH player_scores AS (
                SELECT ls.timestamp, lr.score
                FROM leaderboard_rows lr
                JOIN leaderboard_snapshots ls ON lr.snapshot_id = ls.id
                WHERE lr.player = ${uuid}
                  AND ls.timestamp >= NOW() - INTERVAL '30 days'
                ORDER BY ls.timestamp
              )
              SELECT MAX(score) - MIN(score) AS score_gain
              FROM player_scores;
            `;

            const value =
              res && res[0] && res[0].score_gain != null
                ? Number(res[0].score_gain)
                : 0;

            return jsonResponse({ player: uuid, score_gain: value });
          }

          // GET /api/player/:uuid/scores
          if (parts[3] === "scores" && req.method === "GET") {
            const res = await Bun.sql`
              SELECT ls.timestamp, lr.score
              FROM leaderboard_rows lr
              JOIN leaderboard_snapshots ls ON lr.snapshot_id = ls.id
              WHERE lr.player = ${uuid}
                AND ls.timestamp >= NOW() - INTERVAL '30 days'
              ORDER BY ls.timestamp;
            `;

            const rows = (res || []).map((r: any) => ({
              // Return ISO timestamps so frontend can parse reliably.
              timestamp:
                r.timestamp instanceof Date
                  ? r.timestamp.toISOString()
                  : String(r.timestamp),
              score: r.score == null ? 0 : Number(r.score),
            }));

            return jsonResponse({ player: uuid, rows });
          }
        }

        return jsonResponse({ error: "API route not found" }, 404);
      }

      // Fallback: try to serve public files for any other path
      try {
        return servePublicFile(pathname);
      } catch {
        return textResponse("Not found", 404);
      }
    } catch (err: any) {
      // Log server-side error to console for debugging.
      console.error("Server error:", err);
      return jsonResponse({ error: String(err?.message || err) }, 500);
    }
  },
});

console.log(`Dashboard server running at http://localhost:${PORT}`);
