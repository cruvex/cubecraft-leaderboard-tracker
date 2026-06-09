import { getUuidByIgn, getTopGainers, getTopGainersHistory, getPlayersHistory, getPlayerScores, getLeaderboard, searchPlayerIgns } from "./db";
import { fetchGames } from "./cubepanion";

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
async function resolvePlayerId(id: string): Promise<string | null> {
    const isUuid = id.length >= 32 && (id.includes("-") || id.length === 32);
    return isUuid ? id : await getUuidByIgn(id);
}

// Route Handlers
async function handleTopGainers(req: Request, params: { gameId: string }) {
    const url = new URL(req.url);
    const days = Number(url.searchParams.get("days") || 30);
    const gameId = Number(params.gameId);
    if (isNaN(gameId)) return jsonResponse({ error: "Invalid gameId" }, 400);
    const out = await getTopGainers(days, gameId);
    return jsonResponse(out);
}

async function handleTopGainersHistory(req: Request, params: { gameId: string }) {
    const url = new URL(req.url);
    const days = Number(url.searchParams.get("days") || 30);
    const limit = Number(url.searchParams.get("limit") || 10);
    const gameId = Number(params.gameId);
    if (isNaN(gameId)) return jsonResponse({ error: "Invalid gameId" }, 400);
    const out = await getTopGainersHistory(days, gameId, limit);
    return jsonResponse(out);
}

// Generic batch history for an explicit player set (uuids or igns via ?ids=a,b,c).
// Backs the comparison chart once the client supports custom selections.
async function handlePlayersHistory(req: Request, params: { gameId: string }) {
    const url = new URL(req.url);
    const days = Number(url.searchParams.get("days") || 30);
    const gameId = Number(params.gameId);
    if (isNaN(gameId)) return jsonResponse({ error: "Invalid gameId" }, 400);

    const ids = (url.searchParams.get("ids") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    // Accept either UUIDs or IGNs, mirroring the player-scores endpoint.
    const resolved = await Promise.all(ids.map(resolvePlayerId));
    const uuids = resolved.filter((id): id is string => id !== null);

    const out = await getPlayersHistory(uuids, days, gameId);
    return jsonResponse(out);
}

async function handlePlayerScores(req: Request, params: { gameId: string, id: string }) {
    const id = await resolvePlayerId(params.id);
    if (!id) {
        return jsonResponse({ error: "Player not found" }, 404);
    }
    const url = new URL(req.url);
    const days = Number(url.searchParams.get("days") || 30);
    const gameId = Number(params.gameId);
    if (isNaN(gameId)) return jsonResponse({ error: "Invalid gameId" }, 400);
    const data = await getPlayerScores(id, days, gameId);
    if (!data) {
        return jsonResponse({ error: "Player scores not found" }, 404);
    }
    return jsonResponse(data);
}

async function handleGames() {
    const games = await fetchGames();
    return jsonResponse(games);
}

async function handleSearchPlayers(req: Request) {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) return jsonResponse([]);
    const results = await searchPlayerIgns(q);
    return jsonResponse(results);
}

async function handleLeaderboard (req: Request, params: { gameId: string })  {
    const url = new URL(req.url);
    const days = Number(url.searchParams.get("days") || 30);
    const out = await getLeaderboard(params.gameId, days);
    return jsonResponse(out);
}

// Main server
Bun.serve({
    port: PORT,
    hostname: "0.0.0.0",
    routes: {
        "/api/games/:gameId/top-gainers": (req) => handleTopGainers(req, req.params as { gameId: string }),
        "/api/games/:gameId/top-gainers/history": (req) => handleTopGainersHistory(req, req.params as { gameId: string }),
        "/api/games/:gameId/players/history": (req) => handlePlayersHistory(req, req.params as { gameId: string }),
        "/api/games/:gameId/player/:id": (req) => handlePlayerScores(req, req.params as { gameId: string, id: string }),
        "/api/games": handleGames,
        "/api/games/:gameId/leaderboard": (req) => handleLeaderboard(req, req.params as { gameId: string }),
        "/api/search/players": handleSearchPlayers,
    },
    async fetch(req: Request) {
        return new Response("Not found", { status: 404 });
    },
});

console.log(`Dashboard server running at http://0.0.0.0:${PORT}`);
