ALTER TABLE leaderboard_rows
    DROP CONSTRAINT fk_leaderboard_rows_leaderboard_snapshots_snapshot_id;

ALTER TABLE leaderboard_rows
    ADD CONSTRAINT fk_leaderboard_rows_leaderboard_snapshots_snapshot_id
    FOREIGN KEY (snapshot_id) REFERENCES leaderboard_snapshots (id) ON DELETE CASCADE;

ALTER TABLE leaderboard_snapshots
    ADD CONSTRAINT uq_leaderboard_snapshots_game_id_timestamp UNIQUE (game_id, timestamp);

-- Superseded by the index behind the unique constraint.
DROP INDEX IF EXISTS idx_leaderboard_snapshots_game_id_timestamp;
