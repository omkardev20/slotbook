// Shared test setup: a throwaway SQLite database, the real app on a random
// port, and a cookie-aware fetch. Never touches .env or Turso.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class Client {
  cookies = new Map<string, string>();
  constructor(private base: string) {}

  async call(method: string, path: string, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.cookies.size) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const res = await fetch(this.base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const header of res.headers.getSetCookie()) {
      const [pair = ''] = header.split(';');
      const [name = '', ...rest] = pair.split('=');
      const value = rest.join('=');
      if (value === '' || /Max-Age=0/i.test(header)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON (e.g. the Swagger HTML page) */
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, json: parsed as any, text, headers: res.headers };
  }
}

export async function startTestApp(extraEnv: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'slotbook-test-'));
  for (const key of ['MAIL_FROM', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'CORS_ORIGIN']) {
    delete process.env[key];
  }
  Object.assign(process.env, {
    NODE_ENV: 'development',
    TURSO_DATABASE_URL: `file:${join(dir, 'test.db')}`,
    JWT_SECRET: 'j'.repeat(40),
    OTP_SECRET: 'o'.repeat(40),
    RATE_LIMIT_AUTH_MAX: '1000',
    RATE_LIMIT_REGISTER_MAX: '1000',
    ADMIN_EMAIL: 'admin@test.dev',
    ADMIN_PASSWORD: 'adminpass123',
    ...extraEnv,
  });

  execFileSync('npx', ['tsx', 'src/db/migrate.ts'], { env: process.env, stdio: 'pipe' });
  execFileSync('npx', ['tsx', 'src/db/seedAdmin.ts'], { env: process.env, stdio: 'pipe' });

  const { default: app } = await import('../src/app.ts');
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;

  return {
    app,
    base,
    client: () => new Client(base),
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      const { db } = await import('../src/db/client.ts');
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
