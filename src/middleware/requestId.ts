import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

// Gives every request an id, returns it in the X-Request-Id header and puts it
// in the logs, so one user complaint can be traced to exact log lines.
// A client-supplied id is only reused if it looks harmless.
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const given = req.header('x-request-id');
  req.id = given && SAFE_ID.test(given) ? given : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
