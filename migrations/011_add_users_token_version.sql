-- Bumping this number invalidates every refresh token the user holds
-- ("log out everywhere", password change, account lock).
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
