export async function getTopGainers(days = 30, gameId: number) {
  const res = await Bun.sql`
    WITH scores AS (
      SELECT
        lr.player,
        MAX(lr.score) - MIN(lr.score) AS score_gain
      FROM leaderboard_rows lr
      JOIN leaderboard_snapshots ls ON lr.snapshot_id = ls.id
      WHERE ls.timestamp >= NOW() - CAST(${days + " days"} AS INTERVAL)
        AND ls.game_id = ${gameId}
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
    LEFT JOIN player_igns pi ON s.player = pi.player_uuid
    WHERE s.score_gain > 0
    ORDER BY s.score_gain DESC
  `;

  return (res || []).map((r: any) => ({
    player: r.uuid,
    ign: r.ign || "Unknown",
    score_gain: r.score_gain == null ? 0 : Number(r.score_gain),
  }));
}

/** Score series for an explicit player set, in `uuids` order; players with no data are omitted. */
export async function getPlayersHistory(uuids: string[], days = 30, gameId: number) {
  if (!uuids.length) return [];

  const res = await Bun.sql`
    WITH player_igns AS (
      SELECT DISTINCT ON (player_uuid) player_uuid, player_ign
      FROM ign_history
      ORDER BY player_uuid, id DESC
    )
    SELECT
      lr.player      AS uuid,
      pi.player_ign  AS ign,
      ls.timestamp,
      lr.score
    FROM leaderboard_rows lr
    JOIN leaderboard_snapshots ls ON lr.snapshot_id = ls.id
    LEFT JOIN player_igns pi ON pi.player_uuid = lr.player
    WHERE lr.player IN ${Bun.sql(uuids)}
      AND ls.game_id = ${gameId}
      AND ls.timestamp >= NOW() - CAST(${days + " days"} AS INTERVAL)
    ORDER BY ls.timestamp
  `;

  const seriesByUuid = new Map<string, { timestamp: string; score: number }[]>();
  const ignByUuid = new Map<string, string>();
  for (const r of (res || []) as any[]) {
    let series = seriesByUuid.get(r.uuid);
    if (!series) {
      series = [];
      seriesByUuid.set(r.uuid, series);
    }
    series.push({
      timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
      score: r.score == null ? 0 : Number(r.score),
    });
    if (r.ign) ignByUuid.set(r.uuid, r.ign);
  }

  // Preserve the requested order so the chart's colour/legend assignment is stable.
  return uuids
    .filter((uuid) => seriesByUuid.has(uuid))
    .map((uuid) => ({
      player: uuid,
      ign: ignByUuid.get(uuid) || "Unknown",
      rows: seriesByUuid.get(uuid)!,
    }));
}

/** Default seed for the comparison chart: top-N gainers, then their histories via getPlayersHistory. */
export async function getTopGainersHistory(days = 30, gameId: number, limit = 10) {
  const gainers = await Bun.sql`
    SELECT lr.player AS uuid
    FROM leaderboard_rows lr
    JOIN leaderboard_snapshots ls ON lr.snapshot_id = ls.id
    WHERE ls.timestamp >= NOW() - CAST(${days + " days"} AS INTERVAL)
      AND ls.game_id = ${gameId}
    GROUP BY lr.player
    HAVING MAX(lr.score) - MIN(lr.score) > 0
    ORDER BY MAX(lr.score) - MIN(lr.score) DESC
    LIMIT ${limit}
  `;

  const uuids = (gainers || []).map((r: any) => r.uuid);
  return getPlayersHistory(uuids, days, gameId);
}

export async function getLeaderboard(gameId: string, compareDays: number = 30) {
  const formatTimestamp = (ts: unknown): string | null =>
      ts instanceof Date ? ts.toISOString() : ts ? String(ts) : null;

  const [latestSnapshot] = await Bun.sql`
    SELECT id, timestamp FROM leaderboard_snapshots
    WHERE game_id = ${gameId}
    ORDER BY timestamp DESC
    LIMIT 1
  `;

  if (!latestSnapshot) return { rows: [], departed: [], timestamp: null, compareTimestamp: null };

  const [pastSnapshot] = await Bun.sql`
    SELECT id, timestamp FROM leaderboard_snapshots
    WHERE game_id = ${gameId}
      AND timestamp <= ${latestSnapshot.timestamp}::timestamp - (${compareDays + " days"})::interval
    ORDER BY timestamp DESC
    LIMIT 1
  `;

  // Current + past scores and IGN in one shot; departed players sort last via NULLS LAST on cur.score.
  const allRows = await Bun.sql`
    SELECT
      COALESCE(cur.player, past.player) AS player,
      cur.score                         AS current_score,
      past.score                        AS past_score,
      past.rk                           AS past_rank,
      ih.player_ign                     AS ign
    FROM (
      SELECT player, score
      FROM leaderboard_rows
      WHERE snapshot_id = ${latestSnapshot.id}
    ) cur
    FULL OUTER JOIN (
      SELECT player, score,
             ROW_NUMBER() OVER (ORDER BY score DESC NULLS LAST) AS rk
      FROM leaderboard_rows
      WHERE snapshot_id = ${pastSnapshot?.id ?? null}
    ) past ON cur.player = past.player
           LEFT JOIN (
      SELECT DISTINCT ON (player_uuid) player_uuid, player_ign
      FROM ign_history
      ORDER BY player_uuid, id DESC
    ) ih ON ih.player_uuid = COALESCE(cur.player, past.player)
    ORDER BY cur.score DESC NULLS LAST
  `;

  const currentRows = (allRows as any[]).filter(r => r.current_score != null);
  const departedRows = (allRows as any[]).filter(r => r.current_score == null);

  const rows = currentRows.map((r, i) => {
    const currentRank = i + 1;
    const pastRank: number | null = r.past_rank ? Number(r.past_rank) : null;
    return {
      player: r.player,
      ign: r.ign,
      score: Number(r.current_score),
      rank: currentRank,
      prevRank: pastRank,
      rankChange: pastRank != null ? pastRank - currentRank : null,
      isNew: pastRank == null,
    };
  });

  const departed = departedRows.map(r => ({
    player: r.player,
    ign: r.ign,
    score: Number(r.past_score ?? 0),
    rank: Number(r.past_rank),
  }));

  return {
    rows,
    departed,
    timestamp: formatTimestamp(latestSnapshot.timestamp),
    compareTimestamp: formatTimestamp(pastSnapshot?.timestamp),
  };
}


export async function getPlayerScores(uuid: string, days = 30, gameId: number) {
  const ignRes = await Bun.sql`
    SELECT player_ign
    FROM ign_history
    WHERE player_uuid = ${uuid}
    ORDER BY id DESC
    LIMIT 1
  `;
  if (!ignRes || ignRes.length === 0) return null;
  const ign = ignRes[0].player_ign;

  const scores = await Bun.sql`
    SELECT ls.timestamp, lr.score, lr.position
    FROM leaderboard_rows lr
    JOIN leaderboard_snapshots ls ON lr.snapshot_id = ls.id
    WHERE lr.player = ${uuid}
      AND ls.timestamp >= NOW() - CAST(${Math.max(days, 30) + " days"} AS INTERVAL)
      AND ls.game_id = ${gameId}
    ORDER BY ls.timestamp;
  `;

  if (!scores || scores.length === 0) return null;

  const rows = scores.map((r: any) => ({
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    score: r.score == null ? 0 : Number(r.score),
    position: r.position == null ? 0 : Number(r.position),
  }));

  // Calculate 7d and 30d gains
  const now = Date.now();
  const msIn7Days = 7 * 24 * 60 * 60 * 1000;
  const msIn30Days = 30 * 24 * 60 * 60 * 1000;

  const rows7d = rows.filter(r => (now - new Date(r.timestamp).getTime()) <= msIn7Days);
  const rows30d = rows.filter(r => (now - new Date(r.timestamp).getTime()) <= msIn30Days);

  const gain7d = rows7d.length > 1 ? Math.max(...rows7d.map(r => r.score)) - Math.min(...rows7d.map(r => r.score)) : 0;
  const gain30d = rows30d.length > 1 ? Math.max(...rows30d.map(r => r.score)) - Math.min(...rows30d.map(r => r.score)) : 0;

  // Filter rows for chart based on requested days
  const filteredRows = days === 0 ? rows : rows.filter(r => (now - new Date(r.timestamp).getTime()) <= (days * 24 * 60 * 60 * 1000));

  return { player: uuid, ign, rows: filteredRows, gain7d, gain30d };
}

/** Per-game readings bucketed to their LAST value — an average would invent counts never observed. */
export async function getGamePopulation(gameId: number, hours = 24, bucketSeconds = 300) {
  const buckets = await Bun.sql`
    WITH readings AS (
      SELECT
        to_timestamp(
          floor(extract(epoch FROM timestamp) / ${bucketSeconds}) * ${bucketSeconds}
        ) AS bucket,
        timestamp,
        players
      FROM game_player_counts
      WHERE game_id = ${gameId}
        AND timestamp >= NOW() - CAST(${hours + " hours"} AS INTERVAL)
    )
    SELECT DISTINCT ON (bucket)
      bucket,
      players,
      MAX(players) OVER ()           AS window_peak,
      (AVG(players) OVER ())::float8 AS window_average
    FROM readings
    ORDER BY bucket, timestamp DESC
  `;

  const [latest] = await Bun.sql`
    SELECT timestamp, players
    FROM game_player_counts
    WHERE game_id = ${gameId}
    ORDER BY timestamp DESC
    LIMIT 1
  `;

  const rows = (buckets || []).map((r: any) => ({
    timestamp: r.bucket instanceof Date ? r.bucket.toISOString() : String(r.bucket),
    players: Number(r.players),
  }));

  // Both window functions repeat the same value on every row.
  const [aggregate] = (buckets || []) as any[];

  return {
    gameId,
    bucketSeconds,
    rows,
    peak: aggregate ? Number(aggregate.window_peak) : null,
    average: aggregate ? Number(aggregate.window_average) : null,
    latest: latest
      ? {
          timestamp:
            latest.timestamp instanceof Date
              ? latest.timestamp.toISOString()
              : String(latest.timestamp),
          players: Number(latest.players),
        }
      : null,
  };
}

/** Bucket-averaged: a clocked one-ping-a-minute series, so an empty bucket is a failed poll, not a hold. */
export async function getServerPopulation(hours = 24, bucketSeconds = 300, timeZone = "UTC") {
  const window = Bun.sql`NOW() - CAST(${hours + " hours"} AS INTERVAL)`;

  const buckets = await Bun.sql`
    SELECT
      to_timestamp(
        floor(extract(epoch FROM timestamp) / ${bucketSeconds}) * ${bucketSeconds}
      ) AS bucket,
      AVG(online)::float8 AS online,
      MIN(online)::int    AS low,
      MAX(online)::int    AS high
    FROM server_player_counts
    WHERE timestamp >= ${window}
    GROUP BY bucket
    ORDER BY bucket
  `;

  // Read off the raw rows, so the chosen bucket width never moves them.
  const [aggregate] = await Bun.sql`
    SELECT MAX(online)::int AS peak, AVG(online)::float8 AS average, COUNT(*)::int AS samples
    FROM server_player_counts
    WHERE timestamp >= ${window}
  `;

  const [latest] = await Bun.sql`
    SELECT timestamp, online, max
    FROM server_player_counts
    ORDER BY timestamp DESC
    LIMIT 1
  `;

  // Same bucket width, but keyed on local time of day across 30 days, so the chart can
  // draw what a given clock time usually looks like beside what it did this time.
  const typicalRows = await Bun.sql`
    SELECT
      FLOOR(
        EXTRACT(epoch FROM (timestamp AT TIME ZONE ${timeZone})::time) / ${bucketSeconds}
      )::int AS slot,
      AVG(online)::float8 AS average
    FROM server_player_counts
    WHERE timestamp >= NOW() - CAST('30 days' AS INTERVAL)
    GROUP BY slot
  `;

  const slots = Math.ceil(86400 / bucketSeconds);
  const bySlot = new Map((typicalRows || []).map((r: any) => [Number(r.slot), Number(r.average)]));

  return {
    bucketSeconds,
    typicalDays: 30,
    typical: Array.from({ length: slots }, (_, i) => bySlot.get(i) ?? null),
    rows: (buckets || []).map((r: any) => ({
      timestamp: r.bucket instanceof Date ? r.bucket.toISOString() : String(r.bucket),
      online: Number(r.online),
      low: Number(r.low),
      high: Number(r.high),
    })),
    peak: aggregate?.peak == null ? null : Number(aggregate.peak),
    average: aggregate?.average == null ? null : Number(aggregate.average),
    samples: aggregate ? Number(aggregate.samples) : 0,
    latest: latest
      ? {
          timestamp:
            latest.timestamp instanceof Date
              ? latest.timestamp.toISOString()
              : String(latest.timestamp),
          online: Number(latest.online),
          capacity: Number(latest.max),
        }
      : null,
  };
}

/** Newest reading plus the version range in force, for the live status card. */
export async function getServerStatus() {
  const [latest] = await Bun.sql`
    SELECT timestamp, online, max
    FROM server_player_counts
    ORDER BY timestamp DESC
    LIMIT 1
  `;

  const [version] = await Bun.sql`
    SELECT observed_at, minimum, maximum, raw
    FROM server_versions
    ORDER BY observed_at DESC
    LIMIT 1
  `;

  return {
    latest: latest
      ? {
          timestamp:
            latest.timestamp instanceof Date
              ? latest.timestamp.toISOString()
              : String(latest.timestamp),
          online: Number(latest.online),
          capacity: Number(latest.max),
        }
      : null,
    version: version
      ? {
          minimum: String(version.minimum),
          maximum: String(version.maximum),
          raw: String(version.raw),
          since:
            version.observed_at instanceof Date
              ? version.observed_at.toISOString()
              : String(version.observed_at),
        }
      : null,
  };
}

/** Average online per hour of day, bucketed in `timeZone` so DST and half-hour offsets hold. */
export async function getActiveHours(days = 30, timeZone = "UTC") {
  const rows = await Bun.sql`
    SELECT
      EXTRACT(hour FROM timestamp AT TIME ZONE ${timeZone})::int AS hour,
      AVG(online)::float8 AS average,
      MAX(online)::int    AS peak,
      COUNT(*)::int       AS samples
    FROM server_player_counts
    WHERE timestamp >= NOW() - CAST(${days + " days"} AS INTERVAL)
    GROUP BY hour
    ORDER BY hour
  `;

  const byHour = new Map((rows || []).map((r: any) => [Number(r.hour), r]));

  // All 24 are emitted so a thin hour reads as a gap rather than shifting its neighbours along.
  return {
    days,
    timeZone,
    hours: Array.from({ length: 24 }, (_, hour) => {
      const r = byHour.get(hour);
      return {
        hour,
        average: r ? Number(r.average) : null,
        peak: r ? Number(r.peak) : null,
        samples: r ? Number(r.samples) : 0,
      };
    }),
  };
}

/** Batch IGN->UUID (case-insensitive, latest wins); map keyed by lowercased IGN, misses absent. */
export async function getUuidsByIgns(igns: string[]): Promise<Map<string, string>> {
  if (!igns.length) return new Map();
  const res = await Bun.sql`
    SELECT DISTINCT ON (LOWER(player_ign))
      LOWER(player_ign) AS ign,
      player_uuid
    FROM ign_history
    WHERE LOWER(player_ign) IN ${Bun.sql(igns.map((i) => i.toLowerCase()))}
    ORDER BY LOWER(player_ign), id DESC
  `;
  return new Map((res || []).map((r: any) => [r.ign, r.player_uuid]));
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

export async function searchPlayers(query: string): Promise<{ uuid: string; ign: string }[]> {
  const contains = `%${query}%`;
  const starts = `${query}%`;
  const res = await Bun.sql`
    SELECT player_uuid, player_ign FROM (
      SELECT DISTINCT ON (player_uuid) player_uuid, player_ign
      FROM public.ign_history
      WHERE player_ign ILIKE ${contains}
      ORDER BY player_uuid, id DESC
    ) sub
    ORDER BY
      CASE WHEN player_ign ILIKE ${starts} THEN 0 ELSE 1 END,
      player_ign
    LIMIT 10
  `;
  return (res || []).map((r: any) => ({ uuid: r.player_uuid, ign: r.player_ign }));
}
