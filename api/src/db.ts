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

  // Fetches current + past scores and IGN in one shot.
  // Departed players (past-only) sort to the end via NULLS LAST on cur.score.
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
             RANK() OVER (ORDER BY score DESC NULLS LAST) AS rk
      FROM leaderboard_rows
      WHERE snapshot_id = ${pastSnapshot?.id ?? null}
    ) past ON cur.player = past.player
           LEFT JOIN (
      SELECT DISTINCT ON (player_uuid) player_uuid, player_ign
      FROM ign_history
      ORDER BY player_uuid, id DESC
    ) ih ON ih.player_uuid = COALESCE(cur.player, past.player)
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
    SELECT ls.timestamp, lr.score
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

export async function checkUuidExists(uuid: string): Promise<boolean> {
  const res = await Bun.sql`
    SELECT 1
    FROM ign_history
    WHERE player_uuid = ${uuid}
    LIMIT 1
  `;
  return !!(res && res.length > 0);
}
