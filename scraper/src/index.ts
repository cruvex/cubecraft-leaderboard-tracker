import { z } from "zod";
import { sendReport, type GameReport, type RunReport } from "./report";

const cubepanionBaseUrl = "https://cubepanion.ameliah.art/api/v2";
const mojangBaseUrl = "https://api.mojang.com";
const trackedGames = ["team_eggwars", "solo_skywars", "free_for_all", "mob_who"];

async function main(): Promise<RunReport> {
  const start = Bun.nanoseconds();

  // How deep the leaderboards go is a Cubepanion setting that changes, so it is
  // read per run instead of assumed.
  const config = await fetchLeaderboardConfig();

  // Without the depth there is nothing to check a partial response against.
  if (!config) throw new Error("Leaderboard config not found");

  if (!config.enabled) {
    console.log("Leaderboards are currently disabled");
    return { kind: "disabled" };
  }

  console.log(`Leaderboards hold ${config.playerCount} players`);

  const games = await fetchGames();
  const reports: GameReport[] = [];

  for (const gameName of trackedGames) {
    const game = games.find((g) => g.name === gameName);

    if (!game) {
      console.error(`Game not found: ${gameName}`);
      reports.push({ game: gameName, status: "missing" });
      continue;
    }

    reports.push(await processGame(game, config.playerCount));
  }

  const seconds = (Bun.nanoseconds() - start) / 1_000_000_000;
  console.log(`Checked ${trackedGames.length} games in ${seconds.toFixed(1)}s`);

  return { kind: "run", games: reports };
}

async function processGame(
  game: Game,
  playerCount: number,
): Promise<GameReport> {
  console.log(`Fetching leaderboard for ${game.displayName} (${game.id})`);
  const leaderboard = await fetchGameLeaderboard(game?.name);

  if (!leaderboard) {
    console.log(`Leaderboard not found for ${game.displayName}`);
    return { game: game.displayName, status: "missing" };
  }

  console.log(`Current leaderboard last updated: `, leaderboard.lastUpdated);

  const lastSavedSnapshot = await getLastGameSnapshotTimestamp(game.id);
  console.log(`Last saved snapshot: `, lastSavedSnapshot);

  const isNewSnapshot =
    !lastSavedSnapshot || new Date(leaderboard.lastUpdated) > lastSavedSnapshot;

  if (!isNewSnapshot) {
    console.log("Leaderboard not updated since last snapshot");
    return { game: game.displayName, status: "unchanged" };
  }

  // A short board is a partial response, not a smaller leaderboard: storing it
  // would fabricate departures for everyone below the cut. Only the floor is
  // checked -- some games are served deeper than the config claims.
  if (leaderboard.rows.length < playerCount) {
    console.log(
      `Leaderboard returned ${leaderboard.rows.length} rows (expected at least ${playerCount})`,
    );

    return {
      game: game.displayName,
      status: "partial",
      rows: leaderboard.rows.length,
      expected: playerCount,
    };
  }

  const igns = leaderboard.rows.map((row: LeaderboardPosition) => row.player);

  const uuidMap = await resolvePlayerUUIDs(igns);

  // leaderboard_rows.player is a uuid column, so a player Mojang does not know
  // cannot be stored at all.
  if (uuidMap.size != leaderboard.rows.length) {
    console.log(
      `Resolved ${uuidMap.size} of ${leaderboard.rows.length} players`,
    );

    return {
      game: game.displayName,
      status: "unresolved",
      resolved: uuidMap.size,
      total: leaderboard.rows.length,
    };
  }

  await saveGameLeaderboardSnapshot(leaderboard, uuidMap);
  console.log("Leaderboard snapshot saved");

  return {
    game: game.displayName,
    status: "saved",
    lastUpdated: leaderboard.lastUpdated,
  };
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

    // Logged only: the Discord post does not name players.
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
  }));

  await Bun.sql`INSERT INTO leaderboard_rows ${Bun.sql(leaderboardRows)}`;

  await savePlayerTextures(leaderboard, uuidMap);
}

// One blob per player. The timestamp guard stops a re-run, or a snapshot
// imported out of order, overwriting a newer texture.
async function savePlayerTextures(
  leaderboard: Leaderboard,
  uuidMap: Map<string, string>,
) {
  // Two IGNs on one UUID would make ON CONFLICT hit the same row twice, which
  // Postgres rejects.
  const textures = new Map<string, PlayerTextureRow>();

  for (const row of leaderboard.rows) {
    const player = uuidMap.get(row.player.toLowerCase()) || row.player;

    textures.set(player, {
      player_uuid: player,
      texture: row.texture,
      updated_at: leaderboard.lastUpdated,
    });
  }

  await Bun.sql`
    INSERT INTO player_textures ${Bun.sql([...textures.values()])}
    ON CONFLICT (player_uuid) DO UPDATE
      SET texture    = EXCLUDED.texture,
          updated_at = EXCLUDED.updated_at
    WHERE player_textures.updated_at < EXCLUDED.updated_at
  `;
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

type PlayerTextureRow = {
  player_uuid: string;
  texture: string;
  updated_at: Date;
};

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

// A cron run that dies is invisible unless it says so.
try {
  await sendReport(await main());
} catch (err) {
  console.error(err);
  await sendReport({ kind: "failed", error: err });
}

process.exit(0);
