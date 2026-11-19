import { SignJWT, errors, jwtVerify } from 'jose';
import { env } from '../../config/env.ts';
import type { PublicRole } from './types.ts';

const key = new TextEncoder().encode(env.JWT_SECRET);

type TokenType = 'access' | 'refresh';

export const ACCESS_TTL_SECONDS = Math.round(env.ACCESS_TOKEN_TTL_MINUTES * 60);
// The refresh token is issued at login and dies when the whole login ends:
// access lifetime + refresh window (15 min + 23h45m = 24h). It is never
// re-issued on refresh, so a login cannot be stretched past that limit.
export const REFRESH_TTL_SECONDS =
  ACCESS_TTL_SECONDS + Math.round(env.REFRESH_TOKEN_TTL_MINUTES * 60);

// `tv` is the user's token_version when the token was issued. Bumping the
// number in the database makes every older refresh token fail.
// The access token also carries roles so normal requests need no database read.
async function sign(
  userId: string,
  type: TokenType,
  ttlSeconds: number,
  claims: Record<string, unknown>,
): Promise<string> {
  return new SignJWT({ type, ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);
}

export const signAccessToken = (userId: string, roles: PublicRole[], tokenVersion: number) =>
  sign(userId, 'access', ACCESS_TTL_SECONDS, { roles, tv: tokenVersion });

export const signRefreshToken = (userId: string, tokenVersion: number) =>
  sign(userId, 'refresh', REFRESH_TTL_SECONDS, { tv: tokenVersion });

export interface TokenClaims {
  userId: string;
  tokenVersion: number;
  roles: PublicRole[];
}

export type TokenCheck =
  { ok: true; claims: TokenClaims } | { ok: false; reason: 'expired' | 'invalid' };

// `expected` stops a refresh token being used as an access token, and vice versa.
export async function verifyToken(token: string, expected: TokenType): Promise<TokenCheck> {
  try {
    // Pinning the algorithm blocks "alg: none" and algorithm-swap attacks.
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    if (payload.type !== expected || !payload.sub || typeof payload.tv !== 'number') {
      return { ok: false, reason: 'invalid' };
    }
    const roles = Array.isArray(payload.roles) ? (payload.roles as PublicRole[]) : [];
    return { ok: true, claims: { userId: payload.sub, tokenVersion: payload.tv, roles } };
  } catch (error) {
    return { ok: false, reason: error instanceof errors.JWTExpired ? 'expired' : 'invalid' };
  }
}
