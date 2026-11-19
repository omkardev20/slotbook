// Sends real emails over real SMTP to a local sink (no Gmail, no internet),
// then checks the message the way an inbox would receive it.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { SMTPServer } from 'smtp-server';
import {
  accountExistsEmail,
  consultantApprovedEmail,
  verificationEmail,
} from '../../src/lib/emailTemplates.ts';
import { startTestApp } from '../helpers.ts';

const inbox: string[] = [];
let sink: SMTPServer;
let t: Awaited<ReturnType<typeof startTestApp>>;

// Mail bodies arrive quoted-printable encoded ("=3D", soft line breaks).
const decode = (raw: string) =>
  raw
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));

before(async () => {
  sink = new SMTPServer({
    authOptional: false,
    allowInsecureAuth: true,
    disabledCommands: ['STARTTLS'],
    onAuth: (auth, _session, done) => done(null, { user: auth.username }),
    onData(stream, _session, done) {
      let data = '';
      stream.on('data', (chunk: Buffer) => (data += chunk.toString('utf8')));
      stream.on('end', () => {
        inbox.push(data);
        done();
      });
    },
  });
  await new Promise<void>((resolve) => sink.listen(0, '127.0.0.1', resolve));
  const { port } = sink.server.address() as AddressInfo;

  t = await startTestApp({
    MAIL_FROM: 'no-reply@test.dev',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(port),
    SMTP_USER: 'smtp-user',
    SMTP_PASS: 'smtp-pass',
    OTP_TTL_MINUTES: '10',
    APP_URL: 'https://app.slotbook.test/login',
  });
});

after(async () => {
  await t.stop();
  await new Promise((resolve) => sink.close(resolve));
});

describe('email templates', () => {
  it('verification email has the code in subject, text and html', () => {
    const mail = verificationEmail('482913', 10);
    assert.match(mail.subject, /482913/);
    assert.match(mail.text, /482913/);
    assert.match(mail.html, />482913</); // the big code box
    assert.match(mail.text, /10 minutes/);
    assert.match(mail.html, /<!doctype html>/i);
    assert.match(mail.html, /charset="utf-8"/);
  });

  it('says "1 minute" in the singular', () => {
    assert.match(verificationEmail('111111', 1).text, /1 minute\b(?!s)/);
  });

  it('has no leftover placeholders', () => {
    for (const mail of [verificationEmail('123456', 10), accountExistsEmail()]) {
      for (const part of [mail.subject, mail.text, mail.html]) {
        assert.doesNotMatch(part, /undefined|null|\$\{|\[object/);
      }
    }
  });

  it('shows the logo by Content-ID when available, and a text badge when not', () => {
    const withLogo = verificationEmail('123456', 10, { logo: true });
    assert.match(withLogo.html, /<img src="cid:slotbook-logo"/);
    assert.match(withLogo.html, /alt="SlotBook"/);

    const without = verificationEmail('123456', 10, { logo: false });
    assert.doesNotMatch(without.html, /<img/); // never a broken image
    assert.match(without.html, />S<\/td>/); // the text badge instead
  });

  it('uses the SlotBook theme colours', () => {
    const { html } = verificationEmail('123456', 10);
    assert.match(html, /#4F46E5/); // indigo brand colour
    assert.match(html, /#1E1B4B/); // dark header band
    assert.match(html, /#10B981/); // green accent stripe
    assert.match(html, /SlotBook/);
  });

  it('greets by name, and escapes that name (it is user input)', () => {
    const named = verificationEmail('123456', 10, { name: 'Asha' });
    assert.match(named.text, /^Hi Asha,/);
    assert.match(named.html, /Hi Asha, welcome/);
    assert.match(verificationEmail('123456', 10).text, /^Hi,/);

    const evil = verificationEmail('123456', 10, { name: '<img src=x onerror=alert(1)>' });
    assert.doesNotMatch(evil.html, /<img src=x/);
    assert.match(evil.html, /&lt;img src=x/);
  });

  it('escapes anything dynamic before putting it in HTML', () => {
    const mail = verificationEmail('<script>alert(1)</script>', 10);
    assert.doesNotMatch(mail.html, /<script>alert/);
    assert.match(mail.html, /&lt;script&gt;/);
  });
});

describe('email delivery over SMTP', () => {
  it('sends a multipart message that carries a working code', async () => {
    const c = t.client();
    const res = await c.call('POST', '/auth/register', {
      name: 'Mail One',
      email: 'mail1@test.dev',
      password: 'password123',
      role: 'customer',
    });
    assert.equal(res.status, 202);
    assert.equal(inbox.length, 1);

    const raw = inbox[0]!;
    assert.match(raw, /^From: .*SlotBook.*<?no-reply@test\.dev>?/m);
    assert.match(raw, /^To: mail1@test\.dev/m);
    assert.match(raw, /^Subject: \d{6} is your SlotBook verification code/m);
    assert.match(raw, /multipart\/alternative/);
    assert.match(raw, /Content-Type: text\/plain/);
    assert.match(raw, /Content-Type: text\/html/);

    // The SlotBook logo rides along as an inline image the HTML points at.
    assert.match(raw, /Content-ID: <slotbook-logo>/i);
    assert.match(raw, /Content-Type: image\/png/i);
    assert.match(decode(raw), /src="cid:slotbook-logo"/);
    assert.match(decode(raw), /Hi Mail One, welcome/);

    const code = /verification code is: (\d{6})/.exec(decode(raw))?.[1];
    assert.ok(code, 'code found in the text part');
    assert.match(decode(raw), new RegExp(`>${code}<`)); // and in the html part

    // The emailed code really completes signup.
    const verify = await c.call('POST', '/auth/register/verify', {
      email: 'mail1@test.dev',
      otp: code,
    });
    assert.equal(verify.status, 201);
    assert.equal(verify.json.user.isValid, true);
  });

  it('an existing account gets the "already registered" email, not a code', async () => {
    const before = inbox.length;
    const res = await t.client().call('POST', '/auth/register', {
      name: 'Mail One',
      email: 'mail1@test.dev',
      password: 'password123',
      role: 'customer',
    });
    assert.equal(res.status, 202);
    assert.equal(inbox.length, before + 1);
    const raw = inbox.at(-1)!;
    assert.match(raw, /^Subject: You already have a SlotBook account/m);
    assert.doesNotMatch(decode(raw), /verification code is/);
  });
});

describe('consultant approved email (template)', () => {
  it('congratulates, names the person, and carries the SlotBook theme', () => {
    const mail = consultantApprovedEmail({ name: 'Dr Asha', logo: true });
    assert.match(mail.subject, /consultant account is approved/i);
    assert.match(mail.text, /^Hi Dr Asha,/);
    assert.match(mail.html, /APPROVED/);
    assert.match(mail.html, /<img src="cid:slotbook-logo"/);
    assert.match(mail.html, /#10B981/);
    assert.match(mail.html, /<!doctype html>/i);
  });

  it('has a Log in button only when APP_URL is set', () => {
    const withUrl = consultantApprovedEmail({ appUrl: 'https://app.example.com/login' });
    assert.match(withUrl.html, /<a href="https:\/\/app\.example\.com\/login"/);
    assert.match(withUrl.text, /Log in: https:\/\/app\.example\.com\/login/);

    const without = consultantApprovedEmail();
    assert.doesNotMatch(without.html, /<a href/);
    assert.doesNotMatch(without.text, /Log in:/);
  });

  it('escapes the name and the URL', () => {
    const mail = consultantApprovedEmail({
      name: '<script>x</script>',
      appUrl: 'https://a.test/?q="><script>',
    });
    assert.doesNotMatch(mail.html, /<script>/);
  });

  it('has no leftover placeholders', () => {
    const mail = consultantApprovedEmail({ name: 'Asha', appUrl: 'https://a.test' });
    for (const part of [mail.subject, mail.text, mail.html]) {
      assert.doesNotMatch(part, /undefined|null|\$\{|\[object/);
    }
  });
});

describe('consultant approval email (delivery)', () => {
  const waitFor = async (check: () => boolean) => {
    for (let i = 0; i < 40 && !check(); i += 1) await new Promise((r) => setTimeout(r, 100));
    assert.ok(check(), 'timed out waiting for the email');
  };

  async function verifiedConsultant(email: string, name: string) {
    const c = t.client();
    await c.call('POST', '/auth/register', {
      name,
      email,
      password: 'password123',
      role: 'consultant',
    });
    const mail = inbox.filter((m) => m.includes(`To: ${email}`)).at(-1)!;
    const code = /verification code is: (\d{6})/.exec(decode(mail))?.[1];
    const verify = await c.call('POST', '/auth/register/verify', { email, otp: code });
    assert.equal(verify.status, 201, JSON.stringify(verify.json));
    return verify.json.user.id as string;
  }

  async function admin() {
    const a = t.client();
    await a.call('POST', '/auth/login', { email: 'admin@test.dev', password: 'adminpass123' });
    return a;
  }

  it('emails the consultant when an admin approves them, once', async () => {
    const id = await verifiedConsultant('doc@test.dev', 'Dr Asha');
    const sent = inbox.length;
    const a = await admin();

    const first = await a.call('POST', `/admin/consultants/${id}/approve`);
    assert.equal(first.status, 200);
    await waitFor(() => inbox.length === sent + 1);

    const raw = inbox.at(-1)!;
    assert.match(raw, /^To: doc@test\.dev/m);
    assert.match(raw, /^Subject: Your SlotBook consultant account is approved/m);
    assert.match(raw, /multipart\/alternative/);
    assert.match(raw, /Content-ID: <slotbook-logo>/i);
    const body = decode(raw);
    assert.match(body, /Hi Dr Asha,/);
    assert.match(body, /href="https:\/\/app\.slotbook\.test\/login"/);

    // Approving again is harmless and sends nothing.
    const again = await a.call('POST', `/admin/consultants/${id}/approve`);
    assert.equal(again.status, 200);
    assert.deepEqual(again.json.user.roles, [{ role: 'consultant', isApproved: true }]);
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(inbox.length, sent + 1);
  });

  it('an unverified consultant cannot be approved, and gets no email', async () => {
    const c = t.client();
    await c.call('POST', '/auth/register', {
      name: 'Ghost',
      email: 'ghost@test.dev',
      password: 'password123',
      role: 'consultant',
    });
    const { findUserByEmail } = await import('../../src/modules/auth/users.repository.ts');
    const ghost = await findUserByEmail('ghost@test.dev');
    assert.equal(ghost?.isValid, false);

    const sent = inbox.length;
    const res = await (await admin()).call('POST', `/admin/consultants/${ghost!.id}/approve`);
    assert.equal(res.status, 404);
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(inbox.length, sent);
  });

  it('a customer id is not a consultant: 404, no email', async () => {
    const c = t.client();
    await c.call('POST', '/auth/register', {
      name: 'Cust',
      email: 'cust@test.dev',
      password: 'password123',
      role: 'customer',
    });
    const mail = inbox.filter((m) => m.includes('To: cust@test.dev')).at(-1)!;
    const code = /verification code is: (\d{6})/.exec(decode(mail))?.[1];
    const v = await c.call('POST', '/auth/register/verify', { email: 'cust@test.dev', otp: code });
    const sent = inbox.length;
    const res = await (await admin()).call('POST', `/admin/consultants/${v.json.user.id}/approve`);
    assert.equal(res.status, 404);
    assert.equal(inbox.length, sent);
  });
});
