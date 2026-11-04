import { Router } from 'express';
import { consultantIdSchema } from './schemas.ts';
import { listActiveServices } from './repository.ts';

export const servicesRouter = Router();

// Public list. Creating a service waits for login: the consultant id must
// come from the session, not from the URL, or anyone could write anyone's data.
servicesRouter.get('/consultants/:consultantId/services', async (req, res) => {
  const { consultantId } = consultantIdSchema.parse(req.params);
  const services = await listActiveServices(consultantId);
  res.status(200).json({ services });
});
