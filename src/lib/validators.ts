import { z } from 'zod';

// Shared field checks. Auth and admin schemas compose these instead of
// repeating the email, password, and OTP rules.

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200, 'Password must be at most 200 characters');

export const otpSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const nameSchema = z.string().trim().min(1, 'Name is required').max(80, 'Name is too long');

// The signup buttons. Admin is never accepted from a public form.
export const signupRoleSchema = z.enum(['customer', 'consultant'], {
  error: 'Role must be customer or consultant',
});

export const idSchema = z.uuid('Enter a valid id');
