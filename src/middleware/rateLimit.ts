import type { Request, RequestHandler } from 'express';
import { env } from '../config/env.ts';
import { AppError } from '../lib/errors.ts';

// Fixed-window counter held in this process's memory. Good for one server.
// With several instances each would count separately, so move the counters
// to a shared store (Redis/Upstash) before scaling out.
interface Options {
  name: string; // keeps counters of different routes apart
  max: number;
  windowMs: number;
  key: (req: Request) => string | undefined; // undefined = skip this request
}

const windows = new Map<string, { count: number; resetAt: number }>();

// Without this the map would grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows) if (entry.resetAt <= now) windows.delete(key);
}, 60_000).unref();

export function rateLimit(options: Options): RequestHandler {
  return (req, res, next) => {
    const who = options.key(req);
    if (!who) return next();

    const now = Date.now();
    const id = `${options.name}:${who}`;
    let entry = windows.get(id);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + options.windowMs };
      windows.set(id, entry);
    }

    entry.count += 1;
    if (entry.count > options.max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.');
    }
    next();
  };
}

const windowMs = env.RATE_LIMIT_WINDOW_SECONDS * 1000;

// req.ip is the real client only when TRUST_PROXY matches your proxy setup.
export const limitByIp = (name: string, max: number) =>
  rateLimit({ name: `${name}:ip`, max, windowMs, key: (req) => req.ip });

// Stops one account being attacked from many IPs.
export const limitByEmail = (name: string, max: number) =>
  rateLimit({
    name: `${name}:email`,
    max,
    windowMs,
    key: (req) =>
      typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : undefined,
  });
