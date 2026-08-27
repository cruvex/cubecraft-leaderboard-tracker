-- The timestamps differ on purpose: a status ping carries none of its own, while
-- Cubepanion stamps each reading, so the key drops repeats.

CREATE TABLE server_player_counts (
    timestamp timestamptz NOT NULL PRIMARY KEY,
    online    integer     NOT NULL,
    max       integer     NOT NULL
);

CREATE TABLE game_player_counts (
    timestamp timestamptz NOT NULL,
    game_id   integer     NOT NULL,
    players   integer     NOT NULL,
    PRIMARY KEY (game_id, timestamp)
);
