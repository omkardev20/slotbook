import express from 'express';
import { errorHandler } from './middleware/errorHandler.ts';
import { notFound } from './middleware/notFound.ts';
import { requestLogger } from './middleware/requestLogger.ts';
import { healthRouter } from './modules/health/routes.ts';
import { servicesRouter } from './modules/services/routes.ts';

const app = express();

app.use(requestLogger);

app.use(healthRouter);
app.use(servicesRouter);

// Order matters: these two must stay last.
app.use(notFound);
app.use(errorHandler);

export default app;
