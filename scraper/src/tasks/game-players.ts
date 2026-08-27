import { z } from "zod";
import type { Task } from "../scheduler";

const statsUrl = "https://cubepanion.ameliah.art/api/v2/Stats/games";
const userAgent = "CubeCraftPlus-scraper";
const requestTimeoutMs = 10_000;

export const gamePlayers: Task = {
  name: "game-players",
  schedule: process.env.GAME_PLAYERS_CRON || "*/1 * * * *",
  timeoutMs: 30_000,

  async run({ signal }) {
    const stats = await fetchGameStats(signal);

    if (stats.length === 0) {
      throw new Error("Stats returned no games");
    }

    const rows = stats.map((stat) => ({
      timestamp: stat.timeStamp,
      game_id: stat.gameId,
      players: stat.playerCount,
    }));

    // Counts are scraped off the server by the LabyMod addon rather than
    // published by CubeCraft, so they refresh irregularly. Keying on the
    // reading's own timestamp lets the primary key drop repeats, which makes
    // polling faster than the upstream refreshes free.
    const inserted = await Bun.sql`
      INSERT INTO game_player_counts ${Bun.sql(rows)}
      ON CONFLICT (game_id, timestamp) DO NOTHING
      RETURNING game_id
    `;

    if (inserted.length > 0) {
      console.log(`${inserted.length} new of ${rows.length} counts`);
    }
  },
};

async function fetchGameStats(signal: AbortSignal): Promise<GameStat[]> {
  const res = await fetch(statsUrl, {
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]),
  });

  const parsed = z.array(GameStatSchema).safeParse(await res.json());

  if (!parsed.success) {
    throw new Error(`Invalid stats response: ${parsed.error.message}`);
  }

  return parsed.data;
}

const GameStatSchema = z.object({
  gameId: z.coerce.number(),
  playerCount: z.coerce.number(),
  timeStamp: z.coerce.date(),
});

type GameStat = z.infer<typeof GameStatSchema>;
