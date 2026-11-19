import type { Response } from 'express';
import { env } from '../../config/env.ts';
import { REFRESH_TTL_SECONDS } from './token.ts';

export const ACCESS_COOKIE = 'slotbook_access';
export const REFRESH_COOKIE = 'slotbook_refresh';
// The refresh cookie is only sent to this path, so it is exposed far less.
// Configurable because a proxy prefix (/api/...) changes the path the browser sees.
const REFRESH_PATH = env.REFRESH_COOKIE_PATH;

function readCookie(header: string | undefined, name: string): string | null {
  const pair = header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!pair) return null;
  return decodeURIComponent(pair.slice(name.length + 1)) || null;
}

export const accessTokenFromCookie = (header: string | undefined) =>
  readCookie(header, ACCESS_COOKIE);
export const refreshTokenFromCookie = (header: string | undefined) =>
  readCookie(header, REFRESH_COOKIE);

function writeCookie(
  res: Response,
  name: string,
  value: string,
  path: string,
  maxAgeSeconds: number,
): void {
  const parts = [
    `${name}=${value}`,
    'HttpOnly', // JavaScript in the browser can't read it (blocks XSS theft)
    'SameSite=Lax', // not sent on cross-site POSTs (basic CSRF protection)
    `Path=${path}`,
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (env.NODE_ENV === 'production') parts.push('Secure'); // HTTPS only
  res.append('Set-Cookie', parts.join('; '));
}

// The access cookie outlives the access token on purpose. The browser keeps
// sending the expired token, so the server can answer TOKEN_EXPIRED
// ("refresh me") instead of a vague "not logged in".
export function setAccessCookie(res: Response, token: string): void {
  writeCookie(res, ACCESS_COOKIE, token, '/', REFRESH_TTL_SECONDS);
}

export function setAuthCookies(res: Response, tokens: { access: string; refresh: string }): void {
  setAccessCookie(res, tokens.access);
  writeCookie(res, REFRESH_COOKIE, tokens.refresh, REFRESH_PATH, REFRESH_TTL_SECONDS);
}

export function clearAuthCookies(res: Response): void {
  writeCookie(res, ACCESS_COOKIE, '', '/', 0);
  writeCookie(res, REFRESH_COOKIE, '', REFRESH_PATH, 0); // Path must match to clear it
}
