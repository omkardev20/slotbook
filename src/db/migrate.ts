import { readdir, readFile } from 'node:fs/promises';
import { db } from './client.ts';

// Resolved from this file, so it works from both src/db and dist/db.
const migrationsDir = new URL('../../migrations/', import.meta.url);

// Bookkeeping table: one row per migration file that has been applied.
await db.execute(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id         TEXT    PRIMARY KEY,
    applied_at INTEGER NOT NULL
  ) STRICT
`);

const applied = await db.execute('SELECT id FROM schema_migrations');
const appliedIds = new Set(applied.rows.map((row) => String(row.id)));

// Files run in name order, which is why they start with 001_, 002_, ...
const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

let count = 0;

for (const file of files) {
  if (appliedIds.has(file)) continue;

  const sql = await readFile(new URL(file, migrationsDir), 'utf8');
  const tx = await db.transaction('write');

  try {
    // The migration and its bookkeeping row commit together, or not at all.
    await tx.executeMultiple(sql);
    await tx.execute({
      sql: 'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
      args: [file, Date.now()],
    });
    await tx.commit();
    console.log(`Applied ${file}`);
    count++;
  } catch (error) {
    await tx.rollback();
    console.error(`Failed ${file}:`, error);
    process.exitCode = 1;
    break;
  }
}

if (count === 0 && process.exitCode !== 1) console.log('Database is up to date');

db.close();
