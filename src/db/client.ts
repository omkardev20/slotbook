import { createClient } from '@libsql/client';
import { env } from '../config/env.ts';

// One shared client for the whole app. Every module imports this same `db`
// instead of creating its own connection per request.
export const db = createClient({
  url: env.TURSO_DATABASE_URL,
  // Undefined for a local file: database, which needs no token.
  authToken: env.TURSO_AUTH_TOKEN,
});
