import type { AuthContext, RoleName } from './types.ts';

// An unapproved consultant does NOT have the consultant role yet. Every
// permission check goes through here so no route can forget that rule.
export function hasRole(user: Pick<AuthContext, 'roles'>, role: RoleName): boolean {
  return user.roles.some((r) => r.role === role && (r.role !== 'consultant' || r.isApproved));
}
