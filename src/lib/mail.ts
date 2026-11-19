import { readFileSync } from 'node:fs';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.ts';
import {
  BRAND,
  LOGO_CID,
  accountExistsEmail,
  consultantApprovedEmail,
  verificationEmail,
  type EmailContent,
} from './emailTemplates.ts';
import { OTP_TTL_MS } from './otp.ts';

export function mailConfigured(): boolean {
  return Boolean(env.MAIL_FROM && env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

// assets/email/logo.png is attached to every email as an inline image.
// Drop your own PNG there to rebrand. Missing file = the emails use a text badge.
// (Resolved from this file, so it works from both src/lib and dist/lib.)
const logo: Buffer | null = (() => {
  try {
    return readFileSync(new URL('../../assets/email/logo.png', import.meta.url));
  } catch {
    return null;
  }
})();

// Built once and reused, so each email does not pay for a new connection setup.
let transport: Transporter | undefined;

function getTransport(): Transporter {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP is not configured');
  }
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    // Never let a slow mail server hold a request open for minutes.
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transport;
}

async function send(to: string, content: EmailContent): Promise<void> {
  if (!env.MAIL_FROM) throw new Error('MAIL_FROM is not configured');
  await getTransport().sendMail({
    // Shows as "SlotBook" in the inbox instead of a bare address.
    from: { name: BRAND, address: env.MAIL_FROM },
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
    attachments: logo
      ? [{ filename: 'logo.png', content: logo, cid: LOGO_CID, contentDisposition: 'inline' }]
      : [],
  });
}

export function sendVerificationCode(to: string, code: string, name?: string): Promise<void> {
  return send(to, verificationEmail(code, OTP_TTL_MS / 60_000, { logo: logo !== null, name }));
}

// Sent instead of a code when someone tries to sign up with an email that
// already has an account, so the signup response never reveals which emails exist.
export function sendAccountExistsNotice(to: string): Promise<void> {
  return send(to, accountExistsEmail({ logo: logo !== null }));
}

// Sent when an admin approves a consultant.
export function sendConsultantApproved(to: string, name: string): Promise<void> {
  return send(to, consultantApprovedEmail({ logo: logo !== null, name, appUrl: env.APP_URL }));
}
