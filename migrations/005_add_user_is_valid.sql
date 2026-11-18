-- is_valid is the email proof. It becomes 1 only after the OTP matches.
-- A signup that never finishes does not insert a row here.
ALTER TABLE users ADD COLUMN is_valid INTEGER NOT NULL DEFAULT 0 CHECK (is_valid IN (0, 1));

-- The demo account was seeded before this flag existed. It is a finished row.
UPDATE users
SET is_valid = 1
WHERE id = '11111111-1111-4111-8111-111111111111';
