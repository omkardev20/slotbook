import type { Request, Response } from 'express';

// Reached only when no route matched the request (registered last in app.ts).
// It never calls next(): it ends the request with a JSON 404 in the same
// error shape the whole API uses.
export function notFound(req: Request, res: Response) {
  res.status(404).json({
    error: {
      // Stable, uppercase code that clients can compare exactly.
      code: 'NOT_FOUND',
      // originalUrl = the full path the client asked for, incl. query string.
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
}
