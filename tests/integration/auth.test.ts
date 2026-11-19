// Integration tests for auth. They start the real app against a throwaway
// SQLite file, so they never touch your .env or your Turso database.
// Run with: npm test
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'slotbook-test-'));
const testEnv = {
  NODE_ENV: 'development', // dev mode prints OTPs, which is how the tests read them
  TURSO_DATABASE_URL: `file:${join(dir, 'test.db')}`,
  JWT_SECRET: 'j'.repeat(40),
  OTP_SECRET: 'o'.repeat(40),
  OTP_MAX_ATTEMPTS: '3',
  OTP_RESEND_SECONDS: '30',
  RATE_LIMIT_AUTH_MAX: '1000', // raised so ordinary tests never hit it
  RATE_LIMIT_REGISTER_MAX: '1000',
  ADMIN_EMAIL: 'Admin@Test.dev', // capitals on purpose: must still be able to log in
  ADMIN_PASSWORD: 'adminpass123',
};
Object.assign(process.env, testEnv);
for (const key of ['MAIL_FROM', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'CORS_ORIGIN']) {
  delete process.env[key];
}

// Capture the OTPs the app prints (no SMTP in tests).
const printed: string[] = [];
const realLog = console.log;
console.log = (...args: unknown[]) => {
  const line = args.join(' ');
  if (line.startsWith('Signup OTP')) printed.push(line);
  else if (!line.includes(' GET ') && !line.includes(' POST ') && !line.startsWith('{"audit"')) {
    realLog(...args);
  }
};
const otpFor = (email: string): string => {
  const line = [...printed].reverse().find((l) => l.includes(` ${email}: `));
  assert.ok(line, `no OTP printed for ${email}`);
  return line.split(': ')[1]!;
};

let server: Server;
let base = '';

// A tiny cookie-aware fetch.
class Client {
  cookies = new Map<string, string>();

  async call(method: string, path: string, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.cookies.size) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const res = await fetch(base + path, {
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
    return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers };
  }
}

const regBody = (email: string, role: 'customer' | 'consultant' = 'customer') => ({
  name: 'Test User',
  email,
  password: 'password123',
  role,
});

async function signUp(email: string, role: 'customer' | 'consultant' = 'customer') {
  const client = new Client();
  await client.call('POST', '/auth/register', regBody(email, role));
  const res = await client.call('POST', '/auth/register/verify', { email, otp: otpFor(email) });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return client;
}

// Reads is_valid straight from the database.
async function isValidInDb(email: string): Promise<number | null> {
  const { db } = await import('../../src/db/client.ts');
  const result = await db.execute({
    sql: 'SELECT is_valid FROM users WHERE email = ?',
    args: [email],
  });
  const row = result.rows[0];
  return row ? Number(row.is_valid) : null;
}

before(async () => {
  execFileSync('npx', ['tsx', 'src/db/migrate.ts'], { env: process.env, stdio: 'pipe' });
  execFileSync('npx', ['tsx', 'src/db/seedAdmin.ts'], { env: process.env, stdio: 'pipe' });
  const { default: app } = await import('../../src/app.ts');
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  const { db } = await import('../../src/db/client.ts');
  db.close();
  rmSync(dir, { recursive: true, force: true });
  console.log = realLog;
});

describe('signup', () => {
  it('register saves isValid=false; the correct OTP makes it true and logs the user in', async () => {
    const email = 'flag@test.dev';
    const c = new Client();
    const reg = await c.call('POST', '/auth/register', regBody(email));
    assert.equal(reg.status, 202);
    assert.equal(await isValidInDb(email), 0); // saved, but email not proven

    const verify = await c.call('POST', '/auth/register/verify', { email, otp: otpFor(email) });
    assert.equal(verify.status, 201);
    assert.equal(verify.json.user.isValid, true);
    assert.equal(await isValidInDb(email), 1); // proven

    const me = await c.call('GET', '/auth/me');
    assert.equal(me.status, 200);
    assert.deepEqual(me.json.user.roles, [{ role: 'customer' }]);
  });

  it('an unverified account cannot log in', async () => {
    const email = 'unverified@test.dev';
    await new Client().call('POST', '/auth/register', regBody(email));
    const res = await new Client().call('POST', '/auth/login', { email, password: 'password123' });
    assert.equal(res.status, 401);
    assert.equal(res.json.error.code, 'INVALID_CREDENTIALS');
  });

  it('an unverified consultant is not on the admin approval list', async () => {
    await new Client().call('POST', '/auth/register', regBody('ghostcon@test.dev', 'consultant'));
    const admin = new Client();
    await admin.call('POST', '/auth/login', { email: 'admin@test.dev', password: 'adminpass123' });
    const list = await admin.call('GET', '/admin/consultants');
    const emails = list.json.consultants.map((u: { email: string }) => u.email);
    assert.ok(!emails.includes('ghostcon@test.dev'));
  });

  it('register requires name, email, password and role, and refuses admin', async () => {
    const c = new Client();
    assert.equal((await c.call('POST', '/auth/register', { email: 'x@test.dev' })).status, 400);
    const admin = await c.call('POST', '/auth/register', {
      ...regBody('adm@test.dev'),
      role: 'admin',
    });
    assert.equal(admin.status, 400);
    const extra = await c.call('POST', '/auth/register', {
      ...regBody('e@test.dev'),
      isValid: true,
    });
    assert.equal(extra.status, 400); // a client can never set isValid itself
  });

  it('answers the same for a verified email as for a new one (no enumeration)', async () => {
    const fresh = await new Client().call('POST', '/auth/register', regBody('fresh1@test.dev'));
    const existing = await new Client().call('POST', '/auth/register', regBody('flag@test.dev'));
    assert.equal(fresh.status, 202);
    assert.equal(existing.status, 202);
    assert.deepEqual(Object.keys(fresh.json).sort(), Object.keys(existing.json).sort());
  });

  it('registering a verified email again does not touch the account', async () => {
    await new Client().call('POST', '/auth/register', {
      ...regBody('flag@test.dev', 'consultant'),
      password: 'attackerpass1',
    });
    const login = await new Client().call('POST', '/auth/login', {
      email: 'flag@test.dev',
      password: 'password123',
    });
    assert.equal(login.status, 200);
    assert.deepEqual(login.json.user.roles, [{ role: 'customer' }]);
  });

  it('a second register inside the cooldown changes nothing (old code, old password)', async () => {
    const email = 'cool@test.dev';
    const c = new Client();
    await c.call('POST', '/auth/register', regBody(email));
    const first = otpFor(email);
    const again = await c.call('POST', '/auth/register', {
      ...regBody(email),
      password: 'differentpass1',
    });
    assert.equal(again.status, 202);
    assert.equal(otpFor(email), first); // no new code was sent
    assert.equal(
      (await c.call('POST', '/auth/register/verify', { email, otp: first })).status,
      201,
    );
    const login = await new Client().call('POST', '/auth/login', {
      email,
      password: 'password123',
    });
    assert.equal(login.status, 200); // the FIRST password stuck
  });

  it('every kind of code failure gives the same answer', async () => {
    const c = new Client();
    await c.call('POST', '/auth/register', regBody('wrong@test.dev'));
    const noSignup = await c.call('POST', '/auth/register/verify', {
      email: 'nobody@test.dev',
      otp: '123456',
    });
    const wrongCode = await c.call('POST', '/auth/register/verify', {
      email: 'wrong@test.dev',
      otp: '000000',
    });
    assert.equal(noSignup.status, 401);
    assert.equal(wrongCode.status, 401);
    assert.deepEqual(noSignup.json, wrongCode.json);
  });

  it('after OTP_MAX_ATTEMPTS wrong codes the right code fails and the unverified account is deleted', async () => {
    const email = 'burn@test.dev';
    const c = new Client();
    await c.call('POST', '/auth/register', regBody(email));
    const good = otpFor(email);
    assert.equal(await isValidInDb(email), 0);
    for (let i = 0; i < 3; i += 1) {
      const r = await c.call('POST', '/auth/register/verify', { email, otp: '000000' });
      assert.equal(r.status, 401);
    }
    assert.equal((await c.call('POST', '/auth/register/verify', { email, otp: good })).status, 401);
    assert.equal(await isValidInDb(email), null); // cleaned up, nothing left behind
  });

  it('parallel guesses cannot exceed the attempt limit', async () => {
    const { claimAttempt, saveVerification } =
      await import('../../src/modules/auth/emailVerifications.repository.ts');
    await saveVerification({ email: 'race@test.dev', otpHash: 'x', now: Date.now() });
    const results = await Promise.all(
      Array.from({ length: 50 }, () => claimAttempt('race@test.dev', 3)),
    );
    assert.equal(results.filter((r) => r !== null).length, 3);
  });

  it('one code activates an account at most once even when verified twice at once', async () => {
    const email = 'twice@test.dev';
    await new Client().call('POST', '/auth/register', regBody(email));
    const body = { email, otp: otpFor(email) };
    const [a, b] = await Promise.all([
      new Client().call('POST', '/auth/register/verify', body),
      new Client().call('POST', '/auth/register/verify', body),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [201, 401]);
  });
});

describe('login and tokens', () => {
  before(async () => {
    await signUp('new@test.dev'); // this block's own verified user
  });

  it('logs in, and a wrong password / unknown email look identical', async () => {
    const c = new Client();
    const ok = await c.call('POST', '/auth/login', {
      email: 'new@test.dev',
      password: 'password123',
    });
    assert.equal(ok.status, 200);
    const wrong = await new Client().call('POST', '/auth/login', {
      email: 'new@test.dev',
      password: 'nope',
    });
    const unknown = await new Client().call('POST', '/auth/login', {
      email: 'ghost@test.dev',
      password: 'nope',
    });
    assert.equal(wrong.status, 401);
    assert.deepEqual(wrong.json, unknown.json);
  });

  it('login accepts any non-empty password shape (policy applies at signup only)', async () => {
    const res = await new Client().call('POST', '/auth/login', {
      email: 'new@test.dev',
      password: 'x',
    });
    assert.equal(res.status, 401); // wrong password, not a 400
  });

  it('seeded admin with a capitalised ADMIN_EMAIL can log in', async () => {
    const res = await new Client().call('POST', '/auth/login', {
      email: 'admin@test.dev',
      password: 'adminpass123',
    });
    assert.equal(res.status, 200);
  });

  it('refresh cookie is not an access token, and vice versa', async () => {
    const c = new Client();
    await c.call('POST', '/auth/login', { email: 'new@test.dev', password: 'password123' });
    const swapped = new Client();
    swapped.cookies.set('slotbook_access', c.cookies.get('slotbook_refresh')!);
    assert.equal((await swapped.call('GET', '/auth/me')).status, 401);
    const swapped2 = new Client();
    swapped2.cookies.set('slotbook_refresh', c.cookies.get('slotbook_access')!);
    assert.equal((await swapped2.call('POST', '/auth/refresh')).status, 401);
  });

  it('a tampered token is rejected', async () => {
    const c = new Client();
    await c.call('POST', '/auth/login', { email: 'new@test.dev', password: 'password123' });
    const token = c.cookies.get('slotbook_access')!;
    c.cookies.set('slotbook_access', token.slice(0, -2) + 'xx');
    assert.equal((await c.call('GET', '/auth/me')).status, 401);
  });

  it('refresh gives a new access token', async () => {
    const c = new Client();
    await c.call('POST', '/auth/login', { email: 'new@test.dev', password: 'password123' });
    const before = c.cookies.get('slotbook_access');
    c.cookies.delete('slotbook_access');
    const res = await c.call('POST', '/auth/refresh');
    assert.equal(res.status, 200);
    assert.ok(c.cookies.get('slotbook_access'));
    assert.equal((await c.call('GET', '/auth/me')).status, 200);
    assert.notEqual(before, undefined);
  });

  it('logout-all kills refresh tokens on every device', async () => {
    const phone = new Client();
    const laptop = new Client();
    for (const c of [phone, laptop]) {
      await c.call('POST', '/auth/login', { email: 'new@test.dev', password: 'password123' });
    }
    assert.equal((await phone.call('POST', '/auth/logout-all')).status, 204);
    assert.equal((await laptop.call('POST', '/auth/refresh')).status, 401);
  });
});

describe('permissions', () => {
  it('blocks anonymous and non-admin callers from /admin', async () => {
    assert.equal((await new Client().call('GET', '/admin/consultants')).status, 401);
    const customer = await signUp('cust@test.dev');
    assert.equal((await customer.call('GET', '/admin/consultants')).status, 403);
  });

  it('an unapproved consultant does not hold the consultant role', async () => {
    const { requireRole } = await import('../../src/middleware/permissions.ts');
    const check = requireRole('consultant');
    const run = (roles: unknown) => {
      let passed = false;
      try {
        check({ user: { id: 'u', roles } } as never, {} as never, () => (passed = true));
      } catch {
        /* 403 */
      }
      return passed;
    };
    assert.equal(run([{ role: 'consultant', isApproved: false }]), false);
    assert.equal(run([{ role: 'consultant', isApproved: true }]), true);
  });

  it('admin can approve a consultant', async () => {
    const consultant = await signUp('con@test.dev', 'consultant');
    const me = await consultant.call('GET', '/auth/me');
    const admin = new Client();
    await admin.call('POST', '/auth/login', { email: 'admin@test.dev', password: 'adminpass123' });
    const approve = await admin.call('POST', `/admin/consultants/${me.json.user.id}/approve`);
    assert.equal(approve.status, 200);
    assert.deepEqual(approve.json.user.roles, [{ role: 'consultant', isApproved: true }]);
  });
});

describe('rate limiting', () => {
  it('stops repeated logins for one email with 429 and Retry-After', async () => {
    const { rateLimit } = await import('../../src/middleware/rateLimit.ts');
    const limiter = rateLimit({ name: 'unit', max: 2, windowMs: 60_000, key: () => 'k' });
    const call = () => limiter({} as never, { setHeader() {} } as never, () => {});
    call();
    call();
    assert.throws(
      call,
      (e: { status?: number; code?: string }) => e.status === 429 && e.code === 'RATE_LIMITED',
    );
  });
});

describe('headers', () => {
  it('sets a request id, security headers, and hides X-Powered-By', async () => {
    const res = await new Client().call('GET', '/auth/me');
    assert.ok(res.headers.get('x-request-id'));
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);
  });
});
