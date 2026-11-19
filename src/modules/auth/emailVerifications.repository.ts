import { db } from '../../db/client.ts';
import { asNumber } from '../../db/helpers.ts';
import { OTP_TTL_MS } from '../../lib/otp.ts';

// The code sent to an email address, waiting to be proven. The account it
// belongs to already exists in `users` with is_valid = 0.
export interface EmailVerification {
  email: string;
  otpHash: string;
  expiresAt: number;
  createdAt: number;
}

export async function findVerification(email: string): Promise<EmailVerification | null> {
  const result = await db.execute({
    sql: 'SELECT email, otp_hash, expires_at, created_at FROM email_verifications WHERE email = ?',
    args: [email],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    email: String(row.email),
    otpHash: String(row.otp_hash),
    expiresAt: asNumber(row.expires_at),
    createdAt: asNumber(row.created_at),
  };
}

// Asking again replaces the code and resets the attempt counter.
export async function saveVerification(input: {
  email: string;
  otpHash: string;
  now: number;
}): Promise<void> {
  await db.execute({
    sql: `
      INSERT INTO email_verifications (email, otp_hash, expires_at, attempts, created_at)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT (email) DO UPDATE SET
        otp_hash = excluded.otp_hash,
        expires_at = excluded.expires_at,
        attempts = 0,
        created_at = excluded.created_at
    `,
    args: [input.email, input.otpHash, input.now + OTP_TTL_MS, input.now],
  });
}

// Spends one guess BEFORE the code is compared. It is one atomic statement, so
// 500 parallel requests still get exactly `max` guesses between them.
// Returns the guesses used so far, or null when there is no row or none are left.
export async function claimAttempt(email: string, max: number): Promise<number | null> {
  const result = await db.execute({
    sql: `
      UPDATE email_verifications SET attempts = attempts + 1
      WHERE email = ? AND attempts < ?
      RETURNING attempts
    `,
    args: [email, max],
  });
  const row = result.rows[0];
  return row ? asNumber(row.attempts) : null;
}

export async function deleteVerification(email: string): Promise<void> {
  await db.execute({ sql: 'DELETE FROM email_verifications WHERE email = ?', args: [email] });
}

export async function deleteExpiredVerifications(now = Date.now()): Promise<void> {
  await db.execute({ sql: 'DELETE FROM email_verifications WHERE expires_at <= ?', args: [now] });
}
