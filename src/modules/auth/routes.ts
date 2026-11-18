import { Router } from 'express';
import { clearSessionCookie, sessionIdFromCookie, setSessionCookie } from './cookies.ts';
import { loginSchema, registerSchema, verifySignupSchema } from './schemas.ts';
import { currentUser, login, logout, startSignup, verifySignup } from './service.ts';

export const authRouter = Router();

authRouter.post('/auth/register', async (req, res) => {
  const input = registerSchema.parse(req.body);
  const pending = await startSignup(input);
  res.status(202).json(pending);
});

authRouter.post('/auth/register/verify', async (req, res) => {
  const input = verifySignupSchema.parse(req.body);
  const { user, sessionId } = await verifySignup(input.email, input.otp);
  setSessionCookie(res, sessionId);
  res.status(201).json({ user });
});

authRouter.post('/auth/login', async (req, res) => {
  const input = loginSchema.parse(req.body);
  const previous = sessionIdFromCookie(req.header('cookie'));
  if (previous) await logout(previous);

  const { user, sessionId } = await login(input.email, input.password);
  setSessionCookie(res, sessionId);
  res.status(200).json({ user });
});

authRouter.post('/auth/logout', async (req, res) => {
  await logout(sessionIdFromCookie(req.header('cookie')));
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/auth/me', async (req, res) => {
  const user = await currentUser(sessionIdFromCookie(req.header('cookie')));
  res.status(200).json({ user });
});
