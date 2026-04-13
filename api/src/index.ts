import * as db from "./db";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

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
    hostname: "0.0.0.0",
    routes: {
        "/api/top-gainers": async (req) => {
            const url = new URL(req.url);
            const days = Number(url.searchParams.get("days") || 30);
            const gameId = url.searchParams.get("gameId") ? Number(url.searchParams.get("gameId")) : undefined;
            const out = await db.getTopGainers(days, 50, gameId);
            return jsonResponse(out);
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
        }
    },
    async fetch(req: Request) {
        // If we reach here, no static or api route matched
        return new Response("Not found", { status: 404 });
    },
});

console.log(`Dashboard server running at http://localhost:${PORT}`);
