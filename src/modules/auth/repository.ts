import { randomUUID } from 'node:crypto';
import type { Row } from '@libsql/client';
import { db } from '../../db/client.ts';
import { AppError } from '../../lib/errors.ts';
import { OTP_TTL_MS } from '../../lib/otp.ts';
import { SESSION_TTL_MS } from './cookies.ts';

export type SignupRole = 'customer' | 'consultant';

export type PublicRole =
  { role: 'customer' } | { role: 'consultant'; isApproved: boolean } | { role: 'admin' };

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isValid: boolean;
  roles: PublicRole[];
}

export interface PendingSignup {
  email: string;
  otpHash: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
}

function asNumber(value: Row[string] | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  throw new Error('Expected a number from the database');
}

function asFlag(value: Row[string] | undefined): boolean {
  return asNumber(value) === 1;
}

function mapRoles(rows: Row[]): PublicRole[] {
  const byRole = new Map(rows.map((row) => [String(row.role), row]));
  const roles: PublicRole[] = [];
  if (byRole.has('customer')) roles.push({ role: 'customer' });
  const consultant = byRole.get('consultant');
  if (consultant) roles.push({ role: 'consultant', isApproved: asFlag(consultant.is_approved) });
  if (byRole.has('admin')) roles.push({ role: 'admin' });
  return roles;
}

function isDuplicateEmail(error: unknown): boolean {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (typeof current === 'object' && current !== null && 'message' in current) {
      if (typeof current.message === 'string') messages.push(current.message);
      current = 'cause' in current ? current.cause : undefined;
    } else {
      break;
    }
  }
  return messages.some(
    (message) => message.includes('UNIQUE constraint failed') && message.includes('users.email'),
  );
}

export async function deleteExpiredPending(now = Date.now()): Promise<void> {
  await db.execute({
    sql: 'DELETE FROM pending_signups WHERE expires_at <= ?',
    args: [now],
  });
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const result = await db.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [email],
  });
  const row = result.rows[0];
  return row ? String(row.id) : null;
}

export async function findPending(email: string): Promise<PendingSignup | null> {
  const result = await db.execute({
    sql: `
      SELECT email, otp_hash, expires_at, attempts, created_at
      FROM pending_signups
      WHERE email = ?
    `,
    args: [email],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    email: String(row.email),
    otpHash: String(row.otp_hash),
    expiresAt: asNumber(row.expires_at),
    attempts: asNumber(row.attempts),
    createdAt: asNumber(row.created_at),
  };
}

export async function upsertPending(input: {
  email: string;
  name: string;
  passwordHash: string;
  role: SignupRole;
  otpHash: string;
  now: number;
}): Promise<void> {
  await db.execute({
    sql: `
      INSERT INTO pending_signups (
        email, name, password_hash, role, otp_hash, expires_at, attempts, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT (email) DO UPDATE SET
        name = excluded.name,
        password_hash = excluded.password_hash,
        role = excluded.role,
        otp_hash = excluded.otp_hash,
        expires_at = excluded.expires_at,
        attempts = 0,
        created_at = excluded.created_at
    `,
    args: [
      input.email,
      input.name,
      input.passwordHash,
      input.role,
      input.otpHash,
      input.now + OTP_TTL_MS,
      input.now,
    ],
  });
}

export async function addPendingAttempt(email: string): Promise<number | null> {
  const result = await db.execute({
    sql: `
      UPDATE pending_signups
      SET attempts = attempts + 1
      WHERE email = ?
      RETURNING attempts
    `,
    args: [email],
  });
  const row = result.rows[0];
  return row ? asNumber(row.attempts) : null;
}

export async function deletePending(email: string): Promise<void> {
  await db.execute({
    sql: 'DELETE FROM pending_signups WHERE email = ?',
    args: [email],
  });
}

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const user = await db.execute({
    sql: 'SELECT id, email, name, is_valid FROM users WHERE id = ?',
    args: [userId],
  });
  const row = user.rows[0];
  if (!row) return null;

  const roles = await db.execute({
    sql: 'SELECT role, is_approved FROM user_roles WHERE user_id = ?',
    args: [userId],
  });

  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    isValid: asFlag(row.is_valid),
    roles: mapRoles(roles.rows),
  };
}

export async function createVerifiedAccount(email: string): Promise<AuthUser | null> {
  const tx = await db.transaction('write');
  try {
    const pending = await tx.execute({
      sql: 'SELECT name, password_hash, role FROM pending_signups WHERE email = ?',
      args: [email],
    });
    const row = pending.rows[0];
    if (!row) {
      await tx.rollback();
      return null;
    }

    const role = String(row.role);
    if (role !== 'customer' && role !== 'consultant') {
      throw new Error('Pending signup has an unexpected role');
    }

    const id = randomUUID();
    const now = Date.now();
    const isApproved = role === 'customer' ? 1 : 0;

    await tx.execute({
      sql: `
        INSERT INTO users (id, email, password_hash, name, is_valid, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `,
      args: [id, email, String(row.password_hash), String(row.name), now, now],
    });
    await tx.execute({
      sql: 'INSERT INTO user_roles (user_id, role, is_approved) VALUES (?, ?, ?)',
      args: [id, role, isApproved],
    });
    await tx.execute({
      sql: 'DELETE FROM pending_signups WHERE email = ?',
      args: [email],
    });
    await tx.commit();

    const roles: PublicRole[] =
      role === 'customer' ? [{ role: 'customer' }] : [{ role: 'consultant', isApproved: false }];
    return { id, email, name: String(row.name), isValid: true, roles };
  } catch (error) {
    await tx.rollback();
    if (isDuplicateEmail(error)) {
      throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    }
    throw error;
  }
}

export async function findLoginUser(
  email: string,
): Promise<{ id: string; passwordHash: string } | null> {
  const result = await db.execute({
    sql: 'SELECT id, password_hash FROM users WHERE email = ? AND is_valid = 1',
    args: [email],
  });
  const row = result.rows[0];
  if (!row) return null;
  return { id: String(row.id), passwordHash: String(row.password_hash) };
}

export async function createSession(userId: string): Promise<string> {
  const id = randomUUID();
  const now = Date.now();
  await db.execute({
    sql: 'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    args: [id, userId, now + SESSION_TTL_MS, now],
  });
  return id;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.execute({
    sql: 'DELETE FROM sessions WHERE id = ?',
    args: [sessionId],
  });
}

export async function userForSession(sessionId: string): Promise<AuthUser | null> {
  const result = await db.execute({
    sql: 'SELECT user_id, expires_at FROM sessions WHERE id = ?',
    args: [sessionId],
  });
  const row = result.rows[0];
  if (!row) return null;

  const expiresAt = asNumber(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await deleteSession(sessionId);
    return null;
  }

  const user = await loadAuthUser(String(row.user_id));
  if (!user || !user.isValid) {
    await deleteSession(sessionId);
    return null;
  }
  return user;
}

export async function listWaitingConsultants(): Promise<AuthUser[]> {
  const result = await db.execute(`
    SELECT u.id
    FROM users u
    INNER JOIN user_roles ur ON ur.user_id = u.id
    WHERE ur.role = 'consultant' AND ur.is_approved = 0 AND u.is_valid = 1
    ORDER BY u.name
  `);

  const users: AuthUser[] = [];
  for (const row of result.rows) {
    const user = await loadAuthUser(String(row.id));
    if (user) users.push(user);
  }
  return users;
}

// Missing consultant role is false. An already-approved row stays approved.
export async function approveConsultant(userId: string): Promise<boolean> {
  const existing = await db.execute({
    sql: 'SELECT is_approved FROM user_roles WHERE user_id = ? AND role = ?',
    args: [userId, 'consultant'],
  });
  if (!existing.rows[0]) return false;

  await db.execute({
    sql: 'UPDATE user_roles SET is_approved = 1 WHERE user_id = ? AND role = ?',
    args: [userId, 'consultant'],
  });
  return true;
}
