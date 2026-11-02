import express from 'express';
import { notFound } from './middleware/notFound.ts';

const app = express();

// Middleware order matters: Express runs these top to bottom and stops at
// the first one that sends a response.
//   1. logger   → sees every request, then passes it on
//   2. routes   → answer the requests they match
//   3. notFound → catches anything no route answered

// 1. Request logger — prints e.g. "GET /health 200 3ms" for every request.
app.use((req, res, next) => {
  // Runs NOW, when the request arrives: start the stopwatch.
  const start = Date.now();

  // Register a callback that runs LATER, after the response has been sent.
  // Only then are the final status code and total duration known.
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });

  // Pass the request to the next middleware/route. Without this line the
  // request would stop here and the client would wait forever.
  next();
});

// 2. Routes
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// 3. Fallback — must stay after all routes, otherwise it would answer
// every request with 404 before the routes get a chance.
app.use(notFound);

export default app;
