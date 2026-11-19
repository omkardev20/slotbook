import { randomUUID } from 'node:crypto';
import type { Row } from '@libsql/client';
import { db } from '../../db/client.ts';
import { asFlag, asNumber } from '../../db/helpers.ts';
import { withTransaction } from '../../db/transaction.ts';
import type { AuthUser, PublicRole, SignupRole } from './types.ts';

// One query gives a user plus all their roles (one row per role).
// Other modules append a WHERE clause to this.
export const USER_WITH_ROLES_SQL = `
  SELECT u.id, u.email, u.name, u.is_valid, ur.role, ur.is_approved
  FROM users u
  LEFT JOIN user_roles ur ON ur.user_id = u.id
`;

const ROLE_ORDER = ['customer', 'consultant', 'admin'];

function toRole(row: Row): PublicRole | null {
  switch (row.role) {
    case 'customer':
      return { role: 'customer' };
    case 'consultant':
      return { role: 'consultant', isApproved: asFlag(row.is_approved) };
    case 'admin':
      return { role: 'admin' };
    default:
      return null; // LEFT JOIN: a user with no roles has a NULL role
  }
}

// Folds "one row per (user, role)" into "one object per user".
export function toAuthUsers(rows: Row[]): AuthUser[] {
  const users = new Map<string, AuthUser>();
  for (const row of rows) {
    const id = String(row.id);
    let user = users.get(id);
    if (!user) {
      user = {
        id,
        email: String(row.email),
        name: String(row.name),
        isValid: asFlag(row.is_valid),
        roles: [],
      };
      users.set(id, user);
    }
    const role = toRole(row);
    if (role) user.roles.push(role);
  }
  for (const user of users.values()) {
    user.roles.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  }
  return [...users.values()];
}

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const result = await db.execute({
    sql: `${USER_WITH_ROLES_SQL} WHERE u.id = ?`,
    args: [userId],
  });
  return toAuthUsers(result.rows)[0] ?? null;
}

export async function findUserByEmail(
  email: string,
): Promise<{ id: string; isValid: boolean } | null> {
  const result = await db.execute({
    sql: 'SELECT id, is_valid FROM users WHERE email = ?',
    args: [email],
  });
  const row = result.rows[0];
  return row ? { id: String(row.id), isValid: asFlag(row.is_valid) } : null;
}

export interface LoginAccount {
  id: string;
  passwordHash: string;
  tokenVersion: number;
}

// Only verified accounts (is_valid = 1) can log in.
export async function findLoginUser(email: string): Promise<LoginAccount | null> {
  const result = await db.execute({
    sql: 'SELECT id, password_hash, token_version FROM users WHERE email = ? AND is_valid = 1',
    args: [email],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    passwordHash: String(row.password_hash),
    tokenVersion: asNumber(row.token_version),
  };
}

export async function findTokenVersion(userId: string): Promise<number | null> {
  const result = await db.execute({
    sql: 'SELECT token_version FROM users WHERE id = ?',
    args: [userId],
  });
  const row = result.rows[0];
  return row ? asNumber(row.token_version) : null;
}

// Invalidates every refresh token this user holds. Access tokens die on their own
// within ACCESS_TOKEN_TTL_MINUTES.
export async function bumpTokenVersion(userId: string): Promise<void> {
  await db.execute({
    sql: 'UPDATE users SET token_version = token_version + 1, updated_at = ? WHERE id = ?',
    args: [Date.now(), userId],
  });
}

// Register: saves the account with is_valid = 0 ("email not proven yet").
// A previous UNVERIFIED attempt for the same email is replaced (new name,
// password, role). A VERIFIED account is never touched: returns false then.
export async function saveUnverifiedAccount(input: {
  email: string;
  name: string;
  passwordHash: string;
  role: SignupRole;
}): Promise<boolean> {
  return withTransaction(async (tx) => {
    const now = Date.now();
    const upsert = await tx.execute({
      sql: `
        INSERT INTO users (id, email, password_hash, name, is_valid, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
        ON CONFLICT (email) DO UPDATE SET
          name = excluded.name,
          password_hash = excluded.password_hash,
          updated_at = excluded.updated_at
        WHERE users.is_valid = 0
      `,
      args: [randomUUID(), input.email, input.passwordHash, input.name, now, now],
    });
    if (upsert.rowsAffected === 0) return false; // a verified account owns this email

    const user = await tx.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [input.email],
    });
    const userId = String(user.rows[0]?.id);

    // Customers need no approval. Consultants wait for an admin.
    const isApproved = input.role === 'customer' ? 1 : 0;
    await tx.execute({ sql: 'DELETE FROM user_roles WHERE user_id = ?', args: [userId] });
    await tx.execute({
      sql: 'INSERT INTO user_roles (user_id, role, is_approved) VALUES (?, ?, ?)',
      args: [userId, input.role, isApproved],
    });
    return true;
  });
}

// Verify: the correct OTP flips is_valid from 0 to 1. Consuming the code is part
// of the same transaction, so one code can activate an account at most once even
// when two requests race. Returns null when there was nothing to activate.
export async function activateAccount(
  email: string,
): Promise<{ id: string; tokenVersion: number } | null> {
  return withTransaction(async (tx) => {
    const consumed = await tx.execute({
      sql: 'DELETE FROM email_verifications WHERE email = ? RETURNING email',
      args: [email],
    });
    if (!consumed.rows[0]) return null;

    const activated = await tx.execute({
      sql: `
        UPDATE users SET is_valid = 1, updated_at = ?
        WHERE email = ? AND is_valid = 0
        RETURNING id, token_version
      `,
      args: [Date.now(), email],
    });
    const row = activated.rows[0];
    return row ? { id: String(row.id), tokenVersion: asNumber(row.token_version) } : null;
  });
}

// An unverified account whose code expired, ran out of attempts, or could not
// be emailed is removed, so unproven emails never pile up in the table.
export async function deleteUnverifiedUser(email: string): Promise<void> {
  await db.execute({ sql: 'DELETE FROM users WHERE email = ? AND is_valid = 0', args: [email] });
}

// Unverified accounts that no longer have a code waiting.
export async function deleteOrphanUnverifiedUsers(): Promise<void> {
  await db.execute(`
    DELETE FROM users
    WHERE is_valid = 0 AND email NOT IN (SELECT email FROM email_verifications)
  `);
}
