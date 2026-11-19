import { AppError } from '../../lib/errors.ts';
import { mailConfigured, sendConsultantApproved } from '../../lib/mail.ts';
import type { AuthUser } from '../auth/types.ts';
import { loadAuthUser } from '../auth/users.repository.ts';
import { approveConsultant } from './repository.ts';

// Best effort, in the background. The approval is already saved, so a mail
// problem must neither undo it nor make the admin wait for the mail server.
function notifyApproved(user: AuthUser): void {
  if (!mailConfigured()) {
    console.log(`Consultant approved: ${user.email}. Approval email not sent (SMTP not set).`);
    return;
  }
  sendConsultantApproved(user.email, user.name).catch((error) => {
    console.error('Approval email failed:', error);
  });
}

export async function approveWaitingConsultant(userId: string): Promise<AuthUser> {
  const outcome = await approveConsultant(userId);
  const user = outcome === 'not_found' ? null : await loadAuthUser(userId);
  if (!user) throw new AppError(404, 'CONSULTANT_NOT_FOUND', 'No consultant account has that id');

  // Only the call that actually changed it sends mail. Approving twice does not
  // email twice.
  if (outcome === 'approved') notifyApproved(user);
  return user;
}
