-- Recorded only on change. raw keeps the "We support: 1.20-1.21" string the range
-- was parsed from; version.protocol is not stored, the server just echoes it back.

CREATE TABLE server_versions (
    observed_at timestamptz NOT NULL PRIMARY KEY,
    minimum     text        NOT NULL,
    maximum     text        NOT NULL,
    raw         text        NOT NULL
);
