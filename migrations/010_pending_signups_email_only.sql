-- A pending signup now holds only the email and its code. Name, role and
-- password are supplied together with the correct code, so nobody can pre-set
-- them for someone else's email. Pending rows live minutes, so dropping is safe.
DROP TABLE IF EXISTS pending_signups;

CREATE TABLE pending_signups (
  email      TEXT    PRIMARY KEY,
  otp_hash   TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX pending_signups_expires_at_idx ON pending_signups (expires_at);
