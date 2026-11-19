import type { RequestHandler } from 'express';
import { env } from '../config/env.ts';

// Lets ONE configured frontend origin call the API with cookies. With no
// CORS_ORIGIN set, nothing is added and browsers keep blocking cross-origin calls.
// Cookies are SameSite=Lax, so the frontend must be on the same site as the API
// (or behind a same-origin proxy). Cross-site cookies would also need CSRF tokens.
export const cors: RequestHandler = (req, res, next) => {
  const origin = env.CORS_ORIGIN ? new URL(env.CORS_ORIGIN).origin : null;
  if (!origin || req.header('origin') !== origin) return next();

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
    return;
  }
  next();
};
