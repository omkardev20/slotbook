import type { RequestHandler } from 'express';
import { accessTokenFromCookie } from '../modules/auth/cookies.ts';
import { authenticate } from '../modules/auth/service.ts';

// Put this before any route that needs a logged-in user.
// It checks the access-token cookie and attaches the caller as `req.user`
// (id and roles, no database read), or answers 401 and the route never runs.
export const requireAuth: RequestHandler = async (req, _res, next) => {
  req.user = await authenticate(accessTokenFromCookie(req.header('cookie')));
  next();
};
