import nodemailer from 'nodemailer';
import { env } from '../config/env.ts';

// `npm run mail:check` logs in to the SMTP server and reports if it works.
// It sends no email, so it is safe to run as often as you like.
if (!env.MAIL_FROM || !env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
  console.error('Set MAIL_FROM, SMTP_HOST, SMTP_USER and SMTP_PASS in .env first.');
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

try {
  await transport.verify();
  console.log(`SMTP login OK for ${env.SMTP_USER} via ${env.SMTP_HOST}:${env.SMTP_PORT}`);
} catch (error) {
  console.error('SMTP login failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
