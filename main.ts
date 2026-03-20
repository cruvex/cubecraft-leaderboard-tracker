import { UUID } from "uuidv7";
import { z } from "zod@4.3.6";

const cubepanionBaseUrl = "https://cubepanion.ameliah.art/api/v2";
const mojangBaseUrl = "https://api.mojang.com";

let games: (typeof Game)[];

const playerCache: Map<UUID, typeof PlayerProfile> = new Map();

const trackedGames = ["team_eggwars"];

async function main() {
  await loadGames();

  for (const gameName of trackedGames) {
    await processGame(gameName);
  }
}

async function loadGames() {
  games = await fetchGames();
}

function findGameByName(gameName: string): typeof Game | undefined {
  return games.find((game: typeof Game) => game.name === gameName);
}

async function processGame(gameName: string) {
  const game = findGameByName(gameName);

  if (!game) {
    console.error(`Game not found: ${gameName}`);
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
    const igns = leaderboard.rows.map(
      (row: typeof LeaderboardPosition) => row.player,
    );

    await loadPlayerCache(igns);

    if (playerCache.size != 200) {
      console.log(`Player cache size: ${playerCache.size} (expected 200)`);

      return;
    }

    await saveGameLeaderboardSnapshot(leaderboard);
    console.log("Leaderboard snapshot saved");
  } else {
    console.log("Leaderboard not updated since last snapshot");
  }
}

async function loadPlayerCache(igns: string[]) {
  const cachedPlayers = await getCachedPlayers(igns);
  const uncachedPlayers = igns.filter(
    (ign: string) => !cachedPlayers.some((p) => p.player_ign === ign),
  );

  console.log(uncachedPlayers.length + " players not found in cache");

  let unknownPlayers: (typeof PlayerProfile)[] = [];

  if (uncachedPlayers.length > 0) {
    unknownPlayers = await fetchUnknownPlayers(uncachedPlayers);

    if (!unknownPlayers || unknownPlayers.length === 0) {
      console.log(
        "Failed to fetch players from Mojang: " + uncachedPlayers.join(", "),
      );
    } else {
      await insertCachedPlayers(unknownPlayers);
    }
  }

  const allPlayers = [
    ...cachedPlayers,
    ...unknownPlayers.map((p) => {
      return { player_uuid: p.uuid, player_ign: p.ign };
    }),
  ];

  allPlayers.forEach((player) => {
    playerCache.set(player.player_ign, player);
  });
}

async function saveGameLeaderboardSnapshot(
  leaderboard: typeof LeaderboardResponse,
): Promise<typeof LeaderboardSnapshotRow> {
  const row = await Bun.sql`
    INSERT INTO leaderboard_snapshots (id, game_id, timestamp)
    VALUES (${Bun.randomUUIDv7()}, ${leaderboard.gameId}, ${leaderboard.lastUpdated})
    RETURNING id, game_id, timestamp
  `;

  const parsed = LeaderboardSnapshotRow.safeParse(row[0]);

  if (!parsed.success)
    throw new Error(
      "Failed to parse created leaderboard snapshot: " + parsed.error.message,
    );

  leaderboard.rows.forEach((row: typeof LeaderboardPosition) => {
    console.log(row);
    console.log(playerCache.get(row.player));
  });

  const leaderboardRows = leaderboard.rows.map(
    (row: typeof LeaderboardPosition) => ({
      id: Bun.randomUUIDv7(),
      snapshot_id: parsed.data.id,
      position: row.position,
      player: playerCache.get(row.player).player_uuid || row.player,
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
    SELECT MAX(timestamp) AS last_updated
    FROM leaderboard_snapshots
    WHERE game_id = ${gameId}
  `;

  if (!res || !res[0].last_updated) return null;

  return new Date(res[0].last_updated);
}

async function getCachedPlayers(
  igns: string[],
): Promise<(typeof IgnHistoryRow)[]> {
  const res = await Bun.sql`
    SELECT DISTINCT ON (player_uuid)
        id,
        player_ign,
        player_uuid
    FROM ign_history
    WHERE LOWER(player_ign) IN ${Bun.sql(igns.map((ign) => ign.toLowerCase()))}
    ORDER BY player_uuid, id
  `;

  const parsed = z.array(IgnHistoryRow).safeParse(res);

  if (!parsed.success) {
    console.error("Invalid response:", parsed.error);
    return [];
  }

  return parsed.data;
}

async function insertCachedPlayers(
  players: (typeof PlayerProfile)[],
): Promise<void> {
  players = players.map((player) => ({
    id: Bun.randomUUIDv7(),
    player_ign: player.ign,
    player_uuid: player.uuid,
  }));

  await Bun.sql`
    INSERT INTO ign_history ${Bun.sql(players)}
  `;
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

async function fetchUnknownPlayers(
  igns: string[],
): Promise<(typeof PlayerProfile)[]> {
  const results: (typeof PlayerProfile)[] = [];

  const chunkSize = 10;
  for (let i = 0; i < igns.length; i += chunkSize) {
    const chunk = igns.slice(i, i + chunkSize);
    console.log(chunk);
    results.push(...(await fetchPlayerProfiles(chunk)));
  }
  return results;
}

async function fetchPlayerProfiles(
  igns: string[],
): Promise<(typeof PlayerProfile)[]> {
  const res = await fetch(`${mojangBaseUrl}/profiles/minecraft`, {
    method: "POST",
    body: JSON.stringify(igns),
  });
  const json = await res.json();

  const mapped = json.map((profile: { name: string; id: string }) => ({
    ign: profile.name,
    uuid: profile.id,
  }));

  const parsed = z.array(PlayerProfile).safeParse(mapped);

  if (!parsed.success) {
    console.error("Invalid response:", parsed.error);
    return [];
  }

  return parsed.data;
}

const PlayerProfile = z.object({
  ign: z.string(),
  uuid: z.string(),
});

const IgnHistoryRow = z.object({
  id: z.uuidv7(),
  player_ign: z.string(),
  player_uuid: z.string(),
});

const LeaderboardSnapshotRow = z.object({
  id: z.uuidv7(),
  game_id: z.number(),
  timestamp: z.date(),
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
  lastUpdated: z.iso.datetime(),
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
