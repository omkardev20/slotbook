import { Router } from 'express';
import { sessionIdFromCookie } from '../auth/cookies.ts';
import { userIdParamsSchema } from '../auth/schemas.ts';
import { approveWaitingConsultant, requireAdmin, waitingConsultants } from '../auth/service.ts';

export const adminRouter = Router();

adminRouter.get('/admin/consultants', async (req, res) => {
  await requireAdmin(sessionIdFromCookie(req.header('cookie')));
  const consultants = await waitingConsultants();
  res.status(200).json({ consultants });
});

adminRouter.post('/admin/consultants/:userId/approve', async (req, res) => {
  await requireAdmin(sessionIdFromCookie(req.header('cookie')));
  const { userId } = userIdParamsSchema.parse(req.params);
  const user = await approveWaitingConsultant(userId);
  res.status(200).json({ user });
});
