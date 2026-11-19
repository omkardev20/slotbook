import type { RequestHandler } from 'express';

// A few cheap, safe response headers. (No CSP here: it would break the Swagger page.)
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); // browser must trust our content-type
  res.setHeader('X-Frame-Options', 'DENY'); // nobody may embed the API in an iframe
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
};
