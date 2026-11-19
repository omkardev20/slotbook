import argon2 from 'argon2';
import { env } from '../../config/env.ts';
import { AppError } from '../../lib/errors.ts';
import { mailConfigured, sendAccountExistsNotice, sendVerificationCode } from '../../lib/mail.ts';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_MS,
  OTP_TTL_MS,
  generateOtp,
  hashOtp,
  otpMatches,
} from '../../lib/otp.ts';
import {
  claimAttempt,
  deleteExpiredVerifications,
  deleteVerification,
  findVerification,
  saveVerification,
} from './emailVerifications.repository.ts';
import { signAccessToken, signRefreshToken, verifyToken } from './token.ts';
import type { AuthContext, AuthUser, PublicRole, SignupRole } from './types.ts';
import {
  activateAccount,
  bumpTokenVersion,
  deleteOrphanUnverifiedUsers,
  deleteUnverifiedUser,
  findLoginUser,
  findTokenVersion,
  findUserByEmail,
  loadAuthUser,
  saveUnverifiedAccount,
} from './users.repository.ts';

export interface AuthTokens {
  access: string;
  refresh: string;
}

// Same error for "no such email" and "wrong password" so attackers learn nothing.
const invalidLogin = () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'Login required');
// One error for every way a code can fail (missing, expired, wrong, too many tries),
// so the response never tells an attacker whether an email has a signup waiting.
const invalidOtp = () =>
  new AppError(401, 'OTP_INVALID', 'Invalid or expired code. Request a new one.');
const emailFailed = () =>
  new AppError(503, 'EMAIL_FAILED', 'The verification email could not be sent. Try again.');

// Verified once at startup so a missing account takes as long as a wrong password.
const dummyHash = argon2.hash('slotbook-unused-password');

// ---------- signup ----------

async function deliverCode(email: string, code: string, name: string): Promise<void> {
  if (mailConfigured()) {
    try {
      await sendVerificationCode(email, code, name);
      return;
    } catch (error) {
      console.error('Verification email failed:', error);
      if (env.NODE_ENV === 'production') throw emailFailed();
      // In development a broken SMTP login must not block you: fall through.
    }
  } else if (env.NODE_ENV === 'production') {
    throw emailFailed();
  }
  console.log(`Signup OTP for ${email}: ${code}`);
  console.log('Verification email was not sent. Check SMTP_HOST, SMTP_USER, and SMTP_PASS.');
}

async function notifyExistingAccount(email: string): Promise<void> {
  if (!mailConfigured()) {
    console.log(`Signup attempted for existing account ${email}. No email sent (SMTP not set).`);
    return;
  }
  try {
    await sendAccountExistsNotice(email);
  } catch (error) {
    console.error('Account-exists notice failed:', error); // never surfaced to the caller
  }
}

// An unproven signup is thrown away: its code and its is_valid = 0 account.
async function discardSignup(email: string): Promise<void> {
  await deleteVerification(email);
  await deleteUnverifiedUser(email);
}

// REGISTER. Saves the account with is_valid = false and emails a code.
// Always answers the same way, whether or not the email already has a verified
// account and whether or not a new code was sent. Otherwise this endpoint would
// let anyone check which emails are registered.
export async function startSignup(input: {
  name: string;
  email: string;
  password: string;
  role: SignupRole;
}): Promise<{ email: string; expiresInSeconds: number }> {
  const { email } = input;
  const response = { email, expiresInSeconds: OTP_TTL_MS / 1000 };
  const now = Date.now();

  // Housekeeping: expired codes go, and so do the unverified accounts they belonged to.
  await deleteExpiredVerifications(now);
  await deleteOrphanUnverifiedUsers();

  // Hash first, for every request, so a registered email does not answer faster
  // than a new one (timing would reveal which emails exist).
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

  const existing = await findUserByEmail(email);
  if (existing?.isValid) {
    await notifyExistingAccount(email);
    return response;
  }

  // Inside the cooldown the earlier code is still valid. Do nothing, say the same thing.
  const waiting = await findVerification(email);
  if (waiting && now - waiting.createdAt < OTP_RESEND_MS) return response;

  const code = generateOtp();
  // The code row comes first: a user row without one counts as abandoned.
  await saveVerification({ email, otpHash: hashOtp(email, code), now });
  const saved = await saveUnverifiedAccount({
    email,
    name: input.name,
    passwordHash,
    role: input.role,
  });
  if (!saved) {
    // Someone verified this email a moment ago.
    await deleteVerification(email);
    await notifyExistingAccount(email);
    return response;
  }

  try {
    await deliverCode(email, code, input.name);
  } catch (error) {
    // No email went out, so don't leave rows that block an immediate retry.
    await discardSignup(email);
    throw error;
  }
  return response;
}

// VERIFY. The correct code flips is_valid from false to true and logs the user in.
export async function verifySignup(input: {
  email: string;
  otp: string;
}): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  const { email } = input;

  const waiting = await findVerification(email);
  if (!waiting) throw invalidOtp();
  if (waiting.expiresAt <= Date.now()) {
    await discardSignup(email);
    throw invalidOtp();
  }

  // Spend a guess first, atomically, THEN compare. Checking the counter and
  // updating it in two steps would let parallel requests all slip through.
  const used = await claimAttempt(email, OTP_MAX_ATTEMPTS);
  if (used === null) {
    await discardSignup(email);
    throw invalidOtp();
  }
  if (!otpMatches(email, input.otp, waiting.otpHash)) {
    if (used >= OTP_MAX_ATTEMPTS) await discardSignup(email);
    throw invalidOtp();
  }

  const activated = await activateAccount(email);
  const user = activated ? await loadAuthUser(activated.id) : null;
  if (!activated || !user) throw invalidOtp(); // another request used this code first

  return { user, tokens: await issueTokens(user.id, user.roles, activated.tokenVersion) };
}

// ---------- login ----------

export async function login(
  email: string,
  password: string,
): Promise<{ user: AuthUser; tokens: AuthTokens }> {
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
  if (!user?.isValid) throw invalidLogin();
  return { user, tokens: await issueTokens(user.id, user.roles, account.tokenVersion) };
}

// ---------- tokens ----------

async function issueTokens(
  userId: string,
  roles: PublicRole[],
  tokenVersion: number,
): Promise<AuthTokens> {
  const [access, refresh] = await Promise.all([
    signAccessToken(userId, roles, tokenVersion),
    signRefreshToken(userId, tokenVersion),
  ]);
  return { access, refresh };
}

// Checks the access token's signature and expiry. No database read: the roles
// come from the token, so they can be up to ACCESS_TOKEN_TTL_MINUTES old.
export async function authenticate(accessToken: string | null): Promise<AuthContext> {
  if (!accessToken) throw unauthenticated();

  const check = await verifyToken(accessToken, 'access');
  if (check.ok) return { id: check.claims.userId, roles: check.claims.roles };
  if (check.reason === 'expired') {
    throw new AppError(401, 'TOKEN_EXPIRED', 'Access token expired. Call /auth/refresh.');
  }
  throw unauthenticated();
}

// Trades a valid refresh token for a new access token. This is where the database
// is consulted: a disabled account, a changed role or a bumped token_version
// all stop here. The refresh token itself is not replaced, so the login still
// ends when it expires (24h after login).
export async function refreshAccess(
  refreshToken: string | null,
): Promise<{ user: AuthUser; access: string }> {
  const check = refreshToken ? await verifyToken(refreshToken, 'refresh') : null;
  if (check?.ok) {
    const [user, tokenVersion] = await Promise.all([
      loadAuthUser(check.claims.userId),
      findTokenVersion(check.claims.userId),
    ]);
    if (user?.isValid && tokenVersion === check.claims.tokenVersion) {
      return { user, access: await signAccessToken(user.id, user.roles, tokenVersion) };
    }
  }
  throw new AppError(
    401,
    'REFRESH_TOKEN_INVALID',
    'Refresh token is invalid or expired. Log in again.',
  );
}

// "Log out everywhere": every refresh token this user holds stops working.
export async function logoutEverywhere(userId: string): Promise<void> {
  await bumpTokenVersion(userId);
}

export async function accountOf(userId: string): Promise<AuthUser> {
  const user = await loadAuthUser(userId);
  if (!user?.isValid) throw unauthenticated();
  return user;
}
