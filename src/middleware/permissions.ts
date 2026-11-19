import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.ts';
import { hasRole } from '../modules/auth/roles.ts';
import type { RoleName } from '../modules/auth/types.ts';

// Authentication = "who are you?" (requireAuth). Authorization = "may you do this?" (this).
// Always place it after requireAuth, because it reads req.user.
// An unapproved consultant does not pass requireRole('consultant').
export const requireRole =
  (role: RoleName): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Login required');
    if (!hasRole(req.user, role)) {
      throw new AppError(403, 'FORBIDDEN', `This action requires the ${role} role`);
    }
    next();
  };
