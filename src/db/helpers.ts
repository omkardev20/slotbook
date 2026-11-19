import type { Row } from '@libsql/client';

// libSQL hands back numbers as number | bigint | string | null. These helpers
// turn a raw column into the type we expect, or fail loudly. Every repository
// uses them so no one writes String(row.x) / Number(row.y) by hand.

export function asNumber(value: Row[string] | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  throw new Error('Expected a number from the database');
}

// SQLite has no boolean type. We store 0 / 1.
export function asFlag(value: Row[string] | undefined): boolean {
  return asNumber(value) === 1;
}

// True when `error` is a UNIQUE violation on the given column, e.g. 'users.email'.
// libSQL can wrap the real error in `cause`, so the whole chain is checked.
export function isUniqueViolation(error: unknown, column: string): boolean {
  for (let current = error, depth = 0; current instanceof Error && depth < 4; depth += 1) {
    if (current.message.includes('UNIQUE constraint failed') && current.message.includes(column)) {
      return true;
    }
    current = current.cause;
  }
  return false;
}
