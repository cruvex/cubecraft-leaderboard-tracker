// db.ts - Database query logic for the dashboard
// Separation of concerns: keep SQL logic here
import { z } from "zod";

const cubepanionBaseUrl = "https://cubepanion.ameliah.art/api/v2";

const GameSchema = z.object({
  id: z.number(),
  name: z.string(),
  displayName: z.string(),
  aliases: z.array(z.string()),
  active: z.boolean(),
  scoreType: z.string(),
  shouldTrack: z.boolean(),
  hasPreLobby: z.boolean(),
});

type Game = z.infer<typeof GameSchema>;

export async function fetchGames(): Promise<Game[]> {
  const res = await fetch(`${cubepanionBaseUrl}/Games`);
  const json = await res.json();
  const parsed = z.array(GameSchema).safeParse(json);
  if (!parsed.success) {
    console.error("Invalid response from Cubepanion Games API:", parsed.error);
    return [];
  }
  return parsed.data;
}

export async function getTopGainers(days = 30, limit = 50, gameId?: number) {
  const res = await Bun.sql`
    WITH scores AS (
      SELECT
        lr.player,
        MAX(lr.score) - MIN(lr.score) AS score_gain
      FROM leaderboard_rows lr
      JOIN leaderboard_snapshots ls ON lr.snapshot_id = ls.id
      WHERE ls.timestamp >= NOW() - CAST(${days + " days"} AS INTERVAL)
        ${gameId != null ? Bun.sql`AND ls.game_id = ${gameId}` : Bun.sql``}
      GROUP BY lr.player
    ),
    player_igns AS (
        SELECT DISTINCT ON (player_uuid)
            player_uuid,
            player_ign
        FROM ign_history
        ORDER BY player_uuid, id DESC
    )
    SELECT
        s.player AS uuid,
        pi.player_ign AS ign,
        s.score_gain
    FROM scores s
    LEFT JOIN player_igns pi ON s.player::uuid = pi.player_uuid
    WHERE s.score_gain > 0
    ORDER BY s.score_gain DESC
    LIMIT ${limit}
  `;

  return (res || []).map((r: any) => ({
    player: r.uuid,
    ign: r.ign || "Unknown",
    score_gain: r.score_gain == null ? 0 : Number(r.score_gain),
  }));
}


export async function getPlayerScores(uuid: string, days = 30, gameId?: number) {
  const scores = await Bun.sql`
    SELECT ls.timestamp, lr.score
    FROM leaderboard_rows lr
    JOIN leaderboard_snapshots ls ON lr.snapshot_id = ls.id
    WHERE lr.player = ${uuid}
      AND ls.timestamp >= NOW() - CAST(${days + " days"} AS INTERVAL)
      ${gameId != null ? Bun.sql`AND ls.game_id = ${gameId}` : Bun.sql``}
    ORDER BY ls.timestamp;
  `;

  const ignRes = await Bun.sql`
    SELECT player_ign
    FROM ign_history
    WHERE player_uuid = ${uuid}
    ORDER BY id DESC
    LIMIT 1
  `;
  const ign = ignRes && ignRes[0] ? ignRes[0].player_ign : "Unknown";

  const rows = (scores || []).map((r: any) => ({
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    score: r.score == null ? 0 : Number(r.score),
  }));

  return { player: uuid, ign, rows };
}

export async function getUuidByIgn(ign: string): Promise<string | null> {
  const res = await Bun.sql`
    SELECT player_uuid
    FROM ign_history
    WHERE player_ign ILIKE ${ign}
    ORDER BY id DESC
    LIMIT 1
  `;
  if (!res || res.length === 0) return null;
  return res[0].player_uuid;
}
