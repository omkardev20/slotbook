import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { env } from '../../config/env.ts';

export const SESSION_COOKIE = 'slotbook_session';
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function sign(sessionId: string): string {
  const signature = createHmac('sha256', env.SESSION_SECRET).update(sessionId).digest('base64url');
  return `${sessionId}.${signature}`;
}

export function sessionIdFromCookie(header: string | undefined): string | null {
  if (!header) return null;

  const pair = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!pair) return null;

  const token = decodeURIComponent(pair.slice(SESSION_COOKIE.length + 1));
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const sessionId = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = createHmac('sha256', env.SESSION_SECRET).update(sessionId).digest('base64url');
  const given = Buffer.from(signature);
  const actual = Buffer.from(expected);
  if (given.length !== actual.length || !timingSafeEqual(given, actual)) return null;
  return sessionId;
}

export function setSessionCookie(res: Response, sessionId: string): void {
  const parts = [
    `${SESSION_COOKIE}=${sign(sessionId)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_TTL_MS / 1000}`,
  ];
  if (env.NODE_ENV === 'production') parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res: Response): void {
  const parts = [`${SESSION_COOKIE}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (env.NODE_ENV === 'production') parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}
