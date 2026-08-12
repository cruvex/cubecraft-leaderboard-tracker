CREATE INDEX IF NOT EXISTS idx_leaderboard_rows_snapshot_id
    ON leaderboard_rows (snapshot_id);

CREATE INDEX IF NOT EXISTS idx_leaderboard_rows_player
    ON leaderboard_rows (player);

CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_game_id_timestamp
    ON leaderboard_snapshots (game_id, timestamp);

-- id DESC: the DISTINCT ON sorts player_uuid ascending, id descending.
CREATE INDEX IF NOT EXISTS idx_ign_history_player_uuid_id
    ON ign_history (player_uuid, id DESC);
