-- Baseline schema.
--
-- The database this describes already exists (it was created by hand before
-- migrations did), so every statement is guarded with IF NOT EXISTS: running
-- this against the live database is a no-op that only records the baseline,
-- while a fresh database gets the same shape.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
    id        uuid      PRIMARY KEY,
    game_id   integer   NOT NULL,
    timestamp timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS leaderboard_rows (
    id          uuid    PRIMARY KEY,
    snapshot_id uuid    NOT NULL,
    position    integer NOT NULL,
    player      uuid    NOT NULL,
    score       integer NOT NULL,
    texture     text    NOT NULL,
    CONSTRAINT fk_leaderboard_rows_leaderboard_snapshots_snapshot_id
        FOREIGN KEY (snapshot_id) REFERENCES leaderboard_snapshots (id)
);

CREATE TABLE IF NOT EXISTS ign_history (
    id          uuid PRIMARY KEY,
    player_uuid uuid NOT NULL,
    player_ign  text NOT NULL
);

-- Backs the ILIKE '%query%' player search.
CREATE INDEX IF NOT EXISTS idx_ign_history_ign_trgm
    ON ign_history USING gin (player_ign gin_trgm_ops);
