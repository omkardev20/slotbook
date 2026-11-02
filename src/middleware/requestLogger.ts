import type { NextFunction, Request, Response } from 'express';

// Logs one line per request, e.g. "GET /health 200 3ms".
// Status and duration are only known once the response has been sent,
// so the log happens in the 'finish' callback, after next() has run.
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });

  next();
}
