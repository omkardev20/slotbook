import { Router } from 'express';
import { audit } from '../../lib/audit.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { requireRole } from '../../middleware/permissions.ts';
import { listWaitingConsultants } from './repository.ts';
import { userIdParamsSchema } from './schemas.ts';
import { approveWaitingConsultant } from './service.ts';

export const adminRouter = Router();

// Every /admin route needs a logged-in admin. Declared once, not per route.
adminRouter.use('/admin', requireAuth, requireRole('admin'));

adminRouter.get('/admin/consultants', async (_req, res) => {
  res.status(200).json({ consultants: await listWaitingConsultants() });
});

adminRouter.post('/admin/consultants/:userId/approve', async (req, res) => {
  const { userId } = userIdParamsSchema.parse(req.params);
  const user = await approveWaitingConsultant(userId);
  audit(req, 'consultant.approved', { adminId: req.user?.id, userId });
  res.status(200).json({ user });
});
