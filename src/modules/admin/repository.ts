import { db } from '../../db/client.ts';
import type { AuthUser } from '../auth/types.ts';
import { USER_WITH_ROLES_SQL, toAuthUsers } from '../auth/users.repository.ts';

// Consultants who signed up and verified their email but are not approved yet.
// One query, however many consultants are waiting.
export async function listWaitingConsultants(): Promise<AuthUser[]> {
  const result = await db.execute(`
    ${USER_WITH_ROLES_SQL}
    WHERE u.is_valid = 1
      AND u.id IN (
        SELECT user_id FROM user_roles WHERE role = 'consultant' AND is_approved = 0
      )
    ORDER BY u.name
  `);
  return toAuthUsers(result.rows);
}

export type ApproveOutcome = 'approved' | 'already_approved' | 'not_found';

// Only a VERIFIED account (is_valid = 1) can be approved, so we never act on,
// or email, an address that was not proven. "approved" means this call changed
// it, which is the only time the consultant should be emailed.
export async function approveConsultant(userId: string): Promise<ApproveOutcome> {
  const changed = await db.execute({
    sql: `
      UPDATE user_roles SET is_approved = 1
      WHERE user_id = ? AND role = 'consultant' AND is_approved = 0
        AND user_id IN (SELECT id FROM users WHERE is_valid = 1)
    `,
    args: [userId],
  });
  if (changed.rowsAffected > 0) return 'approved';

  const existing = await db.execute({
    sql: `
      SELECT 1 FROM user_roles
      WHERE user_id = ? AND role = 'consultant' AND is_approved = 1
        AND user_id IN (SELECT id FROM users WHERE is_valid = 1)
    `,
    args: [userId],
  });
  return existing.rows[0] ? 'already_approved' : 'not_found';
}
