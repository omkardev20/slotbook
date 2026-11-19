import express from 'express';
import { env } from './config/env.ts';
import { mountDocs } from './docs/swagger.ts';
import { cors } from './middleware/cors.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { notFound } from './middleware/notFound.ts';
import { requestId } from './middleware/requestId.ts';
import { requestLogger } from './middleware/requestLogger.ts';
import { securityHeaders } from './middleware/securityHeaders.ts';
import { adminRouter } from './modules/admin/routes.ts';
import { authRouter } from './modules/auth/routes.ts';
import { healthRouter } from './modules/health/routes.ts';

const app = express();

app.disable('x-powered-by'); // don't advertise the framework
// Trust the proxy chain so req.ip (used by rate limits and logs) is the real client.
app.set('trust proxy', env.TRUST_PROXY);

app.use(requestId);
app.use(requestLogger);
app.use(securityHeaders);
app.use(cors);
app.use(express.json({ limit: '16kb' }));

app.use(healthRouter);
app.use(authRouter);
app.use(adminRouter);
mountDocs(app);

// Order matters: these two must stay last.
app.use(notFound);
app.use(errorHandler);

export default app;
