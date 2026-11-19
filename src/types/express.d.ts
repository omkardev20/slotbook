import type { AuthContext } from '../modules/auth/types.ts';

// Teaches TypeScript the fields our middleware adds to every request.
declare global {
  namespace Express {
    interface Request {
      id: string; // set by requestId
      user?: AuthContext; // set by requireAuth
    }
  }
}
