-- The table now only holds the email-verification code for an account that was
-- saved with is_valid = 0. (The account itself lives in users.)
ALTER TABLE pending_signups RENAME TO email_verifications;

DROP INDEX IF EXISTS pending_signups_expires_at_idx;
CREATE INDEX email_verifications_expires_at_idx ON email_verifications (expires_at);
