import { Router } from 'express';
import { db } from '../../db/client.ts';

export const healthRouter = Router();

// Liveness: is the process running? Never touches the database.
healthRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness: can the app actually serve requests? Checks the database.
healthRouter.get('/ready', async (_req, res) => {
  try {
    await db.execute('SELECT 1');
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    // The real reason stays in the server log; the client only sees a 503.
    console.error('Readiness check failed:', error);
    res.status(503).json({
      error: { code: 'DB_UNAVAILABLE', message: 'Database is not reachable' },
    });
  }
});
