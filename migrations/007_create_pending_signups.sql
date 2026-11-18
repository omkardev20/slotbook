-- Holds a signup until the OTP matches. The email is not in users yet,
-- so a missed code can be replaced and an expired row can be deleted.
CREATE TABLE pending_signups (
  email         TEXT    PRIMARY KEY,
  name          TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('customer', 'consultant')),
  otp_hash      TEXT    NOT NULL,
  expires_at    INTEGER NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at    INTEGER NOT NULL
) STRICT;

CREATE INDEX pending_signups_expires_at_idx ON pending_signups (expires_at);
