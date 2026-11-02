import express from 'express';
import { errorHandler } from './middleware/errorHandler.ts';
import { notFound } from './middleware/notFound.ts';
import { requestLogger } from './middleware/requestLogger.ts';
import { healthRouter } from './modules/health/routes.ts';

const app = express();

app.use(requestLogger);

app.use(healthRouter);

// Order matters: these two must stay last.
app.use(notFound);
app.use(errorHandler);

export default app;
