import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.ts';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// The code itself is never stored. The hash is bound to the email so a code
// copied onto another signup does not match.
export function hashOtp(email: string, code: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(`${email}:${code}`).digest('base64url');
}

export function otpMatches(email: string, code: string, hash: string): boolean {
  const actual = Buffer.from(hashOtp(email, code));
  const given = Buffer.from(hash);
  if (actual.length !== given.length) return false;
  return timingSafeEqual(actual, given);
}
