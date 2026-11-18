import nodemailer from 'nodemailer';
import { env } from '../config/env.ts';

export function mailConfigured(): boolean {
  return Boolean(env.MAIL_FROM && env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

export async function sendVerificationCode(to: string, code: string): Promise<void> {
  if (!env.MAIL_FROM || !env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP is not configured');
  }

  const port = env.SMTP_PORT;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  await transport.sendMail({
    from: env.MAIL_FROM,
    to,
    subject: 'Your SlotBook verification code',
    text: `Your SlotBook verification code is ${code}. It expires in 10 minutes.`,
  });
}
