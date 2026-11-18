import express from 'express';
import { mountDocs } from './docs/swagger.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { notFound } from './middleware/notFound.ts';
import { requestLogger } from './middleware/requestLogger.ts';
import { adminRouter } from './modules/admin/routes.ts';
import { authRouter } from './modules/auth/routes.ts';
import { healthRouter } from './modules/health/routes.ts';
import { servicesRouter } from './modules/services/routes.ts';

const app = express();

app.use(requestLogger);
app.use(express.json({ limit: '16kb' }));

app.use(healthRouter);
app.use(servicesRouter);
app.use(authRouter);
app.use(adminRouter);
mountDocs(app);

// Order matters: these two must stay last.
app.use(notFound);
app.use(errorHandler);

export default app;
