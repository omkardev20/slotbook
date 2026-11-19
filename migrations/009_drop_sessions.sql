-- Login now uses stateless JWTs, so the sessions table is no longer used.
DROP INDEX IF EXISTS sessions_expires_at_idx;
DROP TABLE IF EXISTS sessions;
