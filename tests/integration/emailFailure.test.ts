// Production rules when email cannot be sent: tell the user, and don't leave
// a half-finished signup behind that blocks the next try.
import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { startTestApp } from '../helpers.ts';

let t: Awaited<ReturnType<typeof startTestApp>>;

before(async () => {
  t = await startTestApp({
    NODE_ENV: 'production',
    MAIL_FROM: 'no-reply@test.dev',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '1', // nothing listens here
    SMTP_USER: 'u',
    SMTP_PASS: 'p',
  });
});
after(() => t.stop());

it('answers 503 EMAIL_FAILED, and an immediate retry is not locked out', async () => {
  const first = await t.client().call('POST', '/auth/register', {
    name: 'Down',
    email: 'down@test.dev',
    password: 'password123',
    role: 'customer',
  });
  assert.equal(first.status, 503);
  assert.equal(first.json.error.code, 'EMAIL_FAILED');

  // Nothing is left behind: no code row and no unverified account.
  const { findVerification } =
    await import('../../src/modules/auth/emailVerifications.repository.ts');
  assert.equal(await findVerification('down@test.dev'), null);
  const { findUserByEmail } = await import('../../src/modules/auth/users.repository.ts');
  assert.equal(await findUserByEmail('down@test.dev'), null);

  // Not 202-silenced by a leftover cooldown row: it tries to send again.
  const retry = await t.client().call('POST', '/auth/register', {
    name: 'Down',
    email: 'down@test.dev',
    password: 'password123',
    role: 'customer',
  });
  assert.equal(retry.status, 503);
});
