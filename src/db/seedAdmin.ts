import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { env } from '../config/env.ts';
import { db } from './client.ts';

const email = env.ADMIN_EMAIL;
const password = env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD before seeding an admin.');
  process.exit(1);
}

const now = Date.now();
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

const existing = await db.execute({
  sql: 'SELECT id FROM users WHERE email = ?',
  args: [email],
});

const id = existing.rows[0] ? String(existing.rows[0].id) : randomUUID();

if (!existing.rows[0]) {
  await db.execute({
    sql: `
      INSERT INTO users (id, email, password_hash, name, is_valid, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `,
    args: [id, email, passwordHash, 'SlotBook Admin', now, now],
  });
} else {
  await db.execute({
    sql: 'UPDATE users SET password_hash = ?, is_valid = 1, updated_at = ? WHERE id = ?',
    args: [passwordHash, now, id],
  });
}

await db.execute({
  sql: `
    INSERT INTO user_roles (user_id, role, is_approved)
    VALUES (?, 'admin', 1)
    ON CONFLICT (user_id, role) DO UPDATE SET is_approved = 1
  `,
  args: [id],
});

console.log(`Admin ready: ${email}`);
db.close();
