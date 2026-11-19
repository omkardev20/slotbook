import { Router } from 'express';
import { env } from '../../config/env.ts';
import { audit } from '../../lib/audit.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { limitByEmail, limitByIp } from '../../middleware/rateLimit.ts';
import {
  clearAuthCookies,
  refreshTokenFromCookie,
  setAccessCookie,
  setAuthCookies,
} from './cookies.ts';
import { loginSchema, registerSchema, verifySignupSchema } from './schemas.ts';
import {
  accountOf,
  login,
  logoutEverywhere,
  refreshAccess,
  startSignup,
  verifySignup,
} from './service.ts';

export const authRouter = Router();

const AUTH_MAX = env.RATE_LIMIT_AUTH_MAX;
const REGISTER_MAX = env.RATE_LIMIT_REGISTER_MAX;

// Register: saves the account as unverified (isValid false) and emails a code.
// Same answer whether or not the email is already registered.
authRouter.post(
  '/auth/register',
  limitByIp('register', REGISTER_MAX),
  limitByEmail('register', REGISTER_MAX),
  async (req, res) => {
    const input = registerSchema.parse(req.body);
    const result = await startSignup(input);
    audit(req, 'signup.requested', { email: input.email, role: input.role });
    res.status(202).json(result);
  },
);

// Verify: the correct code makes the account valid and logs the user in.
authRouter.post(
  '/auth/register/verify',
  limitByIp('verify', AUTH_MAX),
  limitByEmail('verify', AUTH_MAX),
  async (req, res) => {
    const input = verifySignupSchema.parse(req.body);
    try {
      const { user, tokens } = await verifySignup(input);
      audit(req, 'signup.verified', { userId: user.id });
      setAuthCookies(res, tokens);
      res.status(201).json({ user });
    } catch (error) {
      audit(req, 'signup.verify_failed', { email: input.email });
      throw error;
    }
  },
);

authRouter.post(
  '/auth/login',
  limitByIp('login', AUTH_MAX),
  limitByEmail('login', AUTH_MAX),
  async (req, res) => {
    const input = loginSchema.parse(req.body);
    try {
      const { user, tokens } = await login(input.email, input.password);
      audit(req, 'login.success', { userId: user.id });
      setAuthCookies(res, tokens);
      res.status(200).json({ user });
    } catch (error) {
      audit(req, 'login.failed', { email: input.email });
      throw error;
    }
  },
);

// Called when an API request answers 401 TOKEN_EXPIRED.
authRouter.post('/auth/refresh', limitByIp('refresh', AUTH_MAX), async (req, res) => {
  const { user, access } = await refreshAccess(refreshTokenFromCookie(req.header('cookie')));
  setAccessCookie(res, access);
  res.status(200).json({ user });
});

// JWTs can't be deleted server-side, so logout just removes both cookies.
authRouter.post('/auth/logout', (_req, res) => {
  clearAuthCookies(res);
  res.status(204).end();
});

// Also kills every refresh token on every device.
authRouter.post('/auth/logout-all', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  await logoutEverywhere(userId);
  audit(req, 'logout.all', { userId });
  clearAuthCookies(res);
  res.status(204).end();
});

// Reads the database on purpose, so the profile is always fresh.
authRouter.get('/auth/me', requireAuth, async (req, res) => {
  res.status(200).json({ user: await accountOf(req.user!.id) });
});
