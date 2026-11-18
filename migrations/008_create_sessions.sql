-- One row per logged-in browser. The cookie holds this id, not the user id.
-- IF NOT EXISTS: an earlier migration file may already have created this table.
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);
