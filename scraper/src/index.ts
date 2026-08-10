import { z } from "zod";

const cubepanionBaseUrl = "https://cubepanion.ameliah.art/api/v2";
const mojangBaseUrl = "https://api.mojang.com";
const trackedGames = ["team_eggwars", "solo_skywars", "free_for_all", "mob_who"];

async function main() {
  // How deep the leaderboards currently go is a server-side setting that
  // Cubecraft changes from time to time, so it is read per run instead of
  // assumed.
  const config = await fetchLeaderboardConfig();

  if (!config) {
    console.error("Leaderboard config not found");
    return;
  }

  if (!config.enabled) {
    console.log("Leaderboards are currently disabled");
    return;
  }

  console.log(`Leaderboards hold ${config.playerCount} players`);

  const games = await fetchGames();

  for (const gameName of trackedGames) {
    const game = games.find((g) => g.name === gameName);

    if (!game) {
      console.error(`Game not found: ${gameName}`);
      continue;
    }

    await processGame(game, config.playerCount);
  }
}

async function processGame(game: Game, playerCount: number) {
  console.log(`Fetching leaderboard for ${game.displayName} (${game.id})`);
  const leaderboard = await fetchGameLeaderboard(game?.name);

  if (!leaderboard) {
    console.log(`Leaderboard not found for ${game.displayName}`);
    return;
  }

  console.log(`Current leaderboard last updated: `, leaderboard.lastUpdated);

  const lastSavedSnapshot = await getLastGameSnapshotTimestamp(game.id);
  console.log(`Last saved snapshot: `, lastSavedSnapshot);

  const isNewSnapshot =
    !lastSavedSnapshot || new Date(leaderboard.lastUpdated) > lastSavedSnapshot;

  if (isNewSnapshot) {
    // A board shallower than the configured depth is a partial response rather
    // than a smaller leaderboard, and storing it would fabricate departures for
    // everyone below the cut. Only the floor is enforced because some games are
    // still served deeper than the global config claims.
    if (leaderboard.rows.length < playerCount) {
      console.log(
        `Leaderboard returned ${leaderboard.rows.length} rows (expected at least ${playerCount})`,
      );

      return;
    }

    const igns = leaderboard.rows.map((row: LeaderboardPosition) => row.player);

    const uuidMap = await resolvePlayerUUIDs(igns);

    // Expect every uuid to be resolved: leaderboard_rows.player is a uuid column,
    // so a player Mojang does not know cannot be stored at all.
    if (uuidMap.size != leaderboard.rows.length) {
      console.log(
        `Resolved ${uuidMap.size} of ${leaderboard.rows.length} players`,
      );

      return;
    }

    await saveGameLeaderboardSnapshot(leaderboard, uuidMap);
    console.log("Leaderboard snapshot saved");
  } else {
    console.log("Leaderboard not updated since last snapshot");
  }
}

async function resolvePlayerUUIDs(
  igns: string[],
): Promise<Map<string, string>> {
  const cachedPlayers = await getCachedPlayers(igns);
  const cachedIgns = new Set(cachedPlayers.map((p) => p.ign.toLowerCase()));

  const uncachedIgns = igns.filter((ign) => !cachedIgns.has(ign.toLowerCase()));
  console.log(`${uncachedIgns.length} players not found in DB cache`);

  let unknownPlayers: PlayerProfile[] = [];

  if (uncachedIgns.length > 0) {
    unknownPlayers = await fetchUnknownPlayers(uncachedIgns);
    console.log(`Fetched ${unknownPlayers.length} from Mojang API`);

    if (unknownPlayers.length > 0) {
      await insertCachedPlayers(unknownPlayers);
    }

    const notFound = uncachedIgns.filter(
        ign => !unknownPlayers.some(p => p.ign === ign)
    );

    if (notFound.length > 0) {
      console.log(`Not found: ${notFound.length}`);
      console.log(`Unsuccessful players: ${notFound.join(", ")}`);
    }
  }

  const uuidMap = new Map<string, string>();
  [...cachedPlayers, ...unknownPlayers].forEach((player) => {
    uuidMap.set(player.ign.toLowerCase(), player.uuid);
  });

  return uuidMap;
}

async function saveGameLeaderboardSnapshot(
  leaderboard: Leaderboard,
  uuidMap: Map<string, string>,
) {
  const row = await Bun.sql`
    INSERT INTO leaderboard_snapshots (id, game_id, timestamp)
    VALUES (${Bun.randomUUIDv7()}, ${leaderboard.gameId}, ${leaderboard.lastUpdated})
    RETURNING id, game_id, timestamp
  `;

  const parsed = LeaderboardSnapshotRowSchema.safeParse(row[0]);
  if (!parsed.success)
    throw new Error(
      "Failed to parse created leaderboard snapshot: " + parsed.error.message,
    );

  const snapshotId = parsed.data.id;

  const leaderboardRows = leaderboard.rows.map((row) => ({
    id: Bun.randomUUIDv7(),
    snapshot_id: snapshotId,
    position: row.position,
    player: uuidMap.get(row.player.toLowerCase()) || row.player,
    score: row.score,
    texture: row.texture,
  }));

  await Bun.sql`INSERT INTO leaderboard_rows ${Bun.sql(leaderboardRows)}`;
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

async function getCachedPlayers(igns: string[]): Promise<PlayerProfile[]> {
  const res = await Bun.sql`
    SELECT DISTINCT ON (player_uuid)
        id,
        player_ign AS ign,
        player_uuid AS uuid
    FROM ign_history
    WHERE player_ign IN ${Bun.sql(igns)}
    ORDER BY player_uuid, id
  `;

  const parsed = z.array(PlayerProfileShema).safeParse(res);

  if (!parsed.success) {
    console.error("Invalid response:", parsed.error);
    return [];
  }

  return parsed.data;
}

async function insertCachedPlayers(players: PlayerProfile[]): Promise<void> {
  const mappedPlayers = players.map((player) => ({
    id: Bun.randomUUIDv7(),
    player_ign: player.ign,
    player_uuid: player.uuid,
  }));

  await Bun.sql`
    INSERT INTO ign_history ${Bun.sql(mappedPlayers)}
  `;
}

async function fetchGameLeaderboard(
  game: string,
): Promise<Leaderboard | undefined> {
  const res = await fetch(`${cubepanionBaseUrl}/Leaderboard/game/${game}`);
  const json = await res.json();

  const parsed = LeaderboardSchema.safeParse(json);

  if (!parsed.success) {
    console.error("Invalid response:", parsed.error);
    return;
  }

  return parsed.data;
}

async function fetchLeaderboardConfig(): Promise<LeaderboardConfig | undefined> {
  const res = await fetch(`${cubepanionBaseUrl}/Leaderboard/config`);
  const json = await res.json();

  const parsed = LeaderboardConfigSchema.safeParse(json);

  if (!parsed.success) {
    console.error("Invalid response:", parsed.error);
    return;
  }

  return parsed.data;
}

async function fetchGames(): Promise<Game[]> {
  const res = await fetch(`${cubepanionBaseUrl}/Games`);
  const json = await res.json();

  const parsed = GameResponse.safeParse(json);

  if (!parsed.success) {
    console.error("Invalid response:", parsed.error);
    return [];
  }

  return parsed.data;
}

async function fetchUnknownPlayers(igns: string[]): Promise<PlayerProfile[]> {
  const results: PlayerProfile[] = [];

  const chunkSize = 10;
  for (let i = 0; i < igns.length; i += chunkSize) {
    const chunk = igns.slice(i, i + chunkSize);
    console.log(chunk);
    results.push(...(await fetchPlayerProfiles(chunk)));
  }
  return results;
}

async function fetchPlayerProfiles(igns: string[]): Promise<PlayerProfile[]> {
  const res = await fetch(`${mojangBaseUrl}/profiles/minecraft`, {
    method: "POST",
    body: JSON.stringify(igns),
  });
  const json = await res.json();

  const mapped = json.map((profile: { name: string; id: string }) => ({
    ign: profile.name,
    uuid: profile.id,
  }));

  const parsed = z.array(PlayerProfileShema).safeParse(mapped);

  if (!parsed.success) {
    console.error("Invalid response:", parsed.error);
    return [];
  }

  return parsed.data;
}

const PlayerProfileShema = z.object({
  id: z.string().optional(),
  ign: z.string(),
  uuid: z.string(),
});

type PlayerProfile = z.infer<typeof PlayerProfileShema>;

const IgnHistoryRowSchema = z.object({
  id: z.uuidv7(),
  player_ign: z.string(),
  player_uuid: z.string(),
});

type IgnHistoryRow = z.infer<typeof IgnHistoryRowSchema>;

const LeaderboardSnapshotRowSchema = z.object({
  id: z.uuidv7(),
  game_id: z.number(),
  timestamp: z.date(),
});

type LeaderboardSnapshotRow = z.infer<typeof LeaderboardSnapshotRowSchema>;

const LeaderboardPositionSchema = z.object({
  gameId: z.number(),
  position: z.number(),
  player: z.string(),
  score: z.number(),
  texture: z.string(),
});

type LeaderboardPosition = z.infer<typeof LeaderboardPositionSchema>;

const LeaderboardSchema = z.object({
  gameId: z.number(),
  lastUpdated: z.coerce.date(),
  rows: z.array(LeaderboardPositionSchema),
});

type Leaderboard = z.infer<typeof LeaderboardSchema>;

const LeaderboardConfigSchema = z.object({
  enabled: z.boolean(),
  playerCount: z.number(),
  pageCount: z.number(),
});

type LeaderboardConfig = z.infer<typeof LeaderboardConfigSchema>;

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

const GameResponse = z.array(GameSchema);

await main();

process.exit(0);
