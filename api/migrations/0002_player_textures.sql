-- A texture belongs to a player, not to a score, so leaderboard_rows was storing
-- the same blob once per snapshot: 714 players spread over 127k rows.

CREATE TABLE player_textures (
    player_uuid uuid      PRIMARY KEY,
    texture     text      NOT NULL,
    updated_at  timestamp NOT NULL
);

-- Newest blob per player. leaderboard_rows.id is uuidv7, so it breaks ties
-- within a snapshot in insertion order.
INSERT INTO player_textures (player_uuid, texture, updated_at)
SELECT DISTINCT ON (lr.player)
    lr.player,
    lr.texture,
    ls.timestamp
FROM leaderboard_rows lr
JOIN leaderboard_snapshots ls ON ls.id = lr.snapshot_id
ORDER BY lr.player, ls.timestamp DESC, lr.id DESC;

ALTER TABLE leaderboard_rows DROP COLUMN texture;
