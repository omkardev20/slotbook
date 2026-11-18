import argon2 from 'argon2';
import { env } from '../../config/env.ts';
import { AppError } from '../../lib/errors.ts';
import { mailConfigured, sendVerificationCode } from '../../lib/mail.ts';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_MS,
  OTP_TTL_MS,
  generateOtp,
  hashOtp,
  otpMatches,
} from '../../lib/otp.ts';
import type { SignupRole } from './repository.ts';
import {
  addPendingAttempt,
  approveConsultant,
  createSession,
  createVerifiedAccount,
  deleteExpiredPending,
  deletePending,
  deleteSession,
  findLoginUser,
  findPending,
  findUserIdByEmail,
  listWaitingConsultants,
  loadAuthUser,
  upsertPending,
  userForSession,
  type AuthUser,
} from './repository.ts';

export type { AuthUser };

const invalidLogin = () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

// Verified once at startup so a missing account takes as long as a wrong password.
const dummyHash = argon2.hash('slotbook-unused-password');

export async function startSignup(input: {
  name: string;
  email: string;
  password: string;
  role: SignupRole;
}): Promise<{ email: string; expiresInSeconds: number }> {
  const now = Date.now();
  await deleteExpiredPending(now);

  if (await findUserIdByEmail(input.email)) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }

  const pending = await findPending(input.email);
  if (pending && now - pending.createdAt < OTP_RESEND_MS) {
    throw new AppError(429, 'OTP_RESEND_COOLDOWN', 'Wait a minute before requesting another code');
  }

  const code = generateOtp();
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  await upsertPending({
    email: input.email,
    name: input.name,
    passwordHash,
    role: input.role,
    otpHash: hashOtp(input.email, code),
    now,
  });

  // The code goes to the address the person typed. MAIL_FROM is who it is from.
  if (mailConfigured()) {
    try {
      await sendVerificationCode(input.email, code);
    } catch (error) {
      console.error('Verification email failed:', error);
      throw new AppError(503, 'EMAIL_FAILED', 'The verification email could not be sent. Try again.');
    }
  } else if (env.NODE_ENV !== 'production') {
    console.log(`Signup OTP for ${input.email}: ${code}`);
    console.log('Verification email was not sent. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.');
  } else {
    throw new AppError(503, 'EMAIL_FAILED', 'The verification email could not be sent. Try again.');
  }

  return { email: input.email, expiresInSeconds: OTP_TTL_MS / 1000 };
}

export async function verifySignup(
  email: string,
  otp: string,
): Promise<{ user: AuthUser; sessionId: string }> {
  const pending = await findPending(email);
  if (!pending) {
    await deleteExpiredPending();
    throw new AppError(401, 'OTP_NOT_FOUND', 'No signup is waiting for this email. Start again.');
  }
  if (pending.expiresAt <= Date.now()) {
    await deletePending(email);
    throw new AppError(401, 'OTP_EXPIRED', 'That code has expired. Request a new one.');
  }
  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    await deletePending(email);
    throw new AppError(401, 'OTP_TOO_MANY_ATTEMPTS', 'Too many attempts. Request a new code.');
  }
  if (!otpMatches(email, otp, pending.otpHash)) {
    const attempts = await addPendingAttempt(email);
    if (attempts !== null && attempts >= OTP_MAX_ATTEMPTS) {
      await deletePending(email);
      throw new AppError(401, 'OTP_TOO_MANY_ATTEMPTS', 'Too many attempts. Request a new code.');
    }
    throw new AppError(401, 'OTP_INVALID', 'Invalid code');
  }

  const user = await createVerifiedAccount(email);
  if (!user) {
    throw new AppError(401, 'OTP_NOT_FOUND', 'No signup is waiting for this email. Start again.');
  }
  const sessionId = await createSession(user.id);
  return { user, sessionId };
}

export async function login(
  email: string,
  password: string,
): Promise<{ user: AuthUser; sessionId: string }> {
  const account = await findLoginUser(email);
  const hash = account ? account.passwordHash : await dummyHash;

  let matches = false;
  try {
    matches = await argon2.verify(hash, password);
  } catch {
    // A stored value that is not an Argon2 hash is an invalid login, not a 500.
  }

  if (!account || !matches) throw invalidLogin();

  const user = await loadAuthUser(account.id);
  if (!user || !user.isValid) throw invalidLogin();
  const sessionId = await createSession(user.id);
  return { user, sessionId };
}

export async function logout(sessionId: string | null): Promise<void> {
  if (sessionId) await deleteSession(sessionId);
}

export async function currentUser(sessionId: string | null): Promise<AuthUser> {
  if (!sessionId) throw new AppError(401, 'UNAUTHENTICATED', 'Login required');
  const user = await userForSession(sessionId);
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Login required');
  return user;
}

export async function requireAdmin(sessionId: string | null): Promise<AuthUser> {
  const user = await currentUser(sessionId);
  const isAdmin = user.roles.some((role) => role.role === 'admin');
  if (!isAdmin) throw new AppError(403, 'FORBIDDEN', 'Admin access is required');
  return user;
}

export async function waitingConsultants(): Promise<AuthUser[]> {
  return listWaitingConsultants();
}

export async function approveWaitingConsultant(userId: string): Promise<AuthUser> {
  const approved = await approveConsultant(userId);
  if (!approved) {
    throw new AppError(404, 'CONSULTANT_NOT_FOUND', 'No consultant account has that id');
  }
  const user = await loadAuthUser(userId);
  if (!user) throw new AppError(404, 'CONSULTANT_NOT_FOUND', 'No consultant account has that id');
  return user;
}
