import { z } from "zod@4.3.6";

const cubepanionBaseUrl = "https://cubepanion.ameliah.art/api/v2";

let games: (typeof Game)[];

async function main() {
  games = await fetchGames();

  const game = games.find((game: typeof Game) => game.name === "team_eggwars");

  if (!game) {
    console.error("Game not found");
    return;
  }

  console.log(`Fetching leaderboard for ${game.displayName} (${game.id})`);

  const leaderboard = await fetchGameLeaderboard(game?.name);
  console.log(`Current leaderboard last updated: `, leaderboard.lastUpdated);

  const lastSavedSnapshot = await getLastGameSnapshotTimestamp(game?.id);
  console.log(`Last saved snapshot: `, lastSavedSnapshot);

  if (
    !lastSavedSnapshot ||
    new Date(leaderboard.lastUpdated) > lastSavedSnapshot
  ) {
    await saveGameLeaderboardSnapshot(leaderboard);
    console.log("Leaderboard snapshot saved");
  } else {
    console.log("Leaderboard not updated since last snapshot");
  }
}

async function saveGameLeaderboardSnapshot(
  leaderboard: typeof LeaderboardResponse,
): Promise<typeof LeaderboardSnapshotRow> {
  const row = await Bun.sql`
    INSERT INTO leaderboard_snapshots (id, game_id, last_updated)
    VALUES (${Bun.randomUUIDv7()}, ${leaderboard.gameId}, ${leaderboard.lastUpdated})
    RETURNING id, game_id, last_updated
  `;

  const parsed = LeaderboardSnapshotRow.safeParse(row[0]);

  if (!parsed.success)
    throw new Error(
      "Failed to parse created leaderboard snapshot: " + parsed.error.message,
    );

  const leaderboardRows = leaderboard.rows.map(
    (row: typeof LeaderboardPosition) => ({
      id: Bun.randomUUIDv7(),
      snapshot_id: parsed.data.id,
      position: row.position,
      player: row.player,
      score: row.score,
      texture: row.texture,
    }),
  );

  await Bun.sql`INSERT INTO leaderboard_rows ${Bun.sql(leaderboardRows)}`;

  return parsed;
}

async function getLastGameSnapshotTimestamp(
  gameId: number,
): Promise<Date | null> {
  const res = await Bun.sql`
    SELECT MAX(last_updated) AS last_updated
    FROM leaderboard_snapshots
    WHERE game_id = ${gameId}
  `;

  if (!res || !res[0].last_updated) return null;

  return new Date(res[0].last_updated);
}

async function fetchGameLeaderboard(
  game: string,
): Promise<typeof LeaderboardResponse> {
  const res = await fetch(`${cubepanionBaseUrl}/Leaderboard/game/${game}`);
  const json = await res.json();

  const parsed = LeaderboardResponse.safeParse(json);

  if (!parsed.success) {
    console.error("Invalid response:", parsed.error);
    return;
  }

  return parsed.data;
}

async function fetchGames(): Promise<typeof GameResponse> {
  const res = await fetch(`${cubepanionBaseUrl}/Games`);
  const json = await res.json();

  const parsed = GameResponse.safeParse(json);

  if (!parsed.success) {
    console.error("Invalid response:", parsed.error);
    return;
  }

  return parsed.data;
}

const LeaderboardSnapshotRow = z.object({
  id: z.uuidv7(),
  game_id: z.number(),
  last_updated: z.date(),
});

const LeaderboardPosition = z.object({
  gameId: z.number(),
  position: z.number(),
  player: z.string(),
  score: z.number(),
  texture: z.string(),
});

const LeaderboardResponse = z.object({
  gameId: z.number(),
  lastUpdated: z.date(),
  rows: z.array(LeaderboardPosition),
});

const Game = z.object({
  id: z.number(),
  name: z.string(),
  displayName: z.string(),
  aliases: z.array(z.string()),
  active: z.boolean(),
  scoreType: z.string(),
  shouldTrack: z.boolean(),
  hasPreLobby: z.boolean(),
});

const GameResponse = z.array(Game);

main();
