import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from './openapi.ts';

export function mountDocs(app: Express): void {
  app.get('/openapi.json', (_req, res) => {
    res.status(200).json(openApiDocument);
  });

  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      swaggerOptions: { withCredentials: true },
    }),
  );
}
