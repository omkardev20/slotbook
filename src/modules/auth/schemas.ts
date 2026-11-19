import { z } from 'zod';
import {
  emailSchema,
  nameSchema,
  otpSchema,
  passwordSchema,
  signupRoleSchema,
} from '../../lib/validators.ts';

// Register: saves the account as unverified (is_valid = false) and emails a code.
export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    role: signupRoleSchema,
  })
  .strict();

// Verify: the correct code flips is_valid to true.
export const verifySignupSchema = z
  .object({
    email: emailSchema,
    otp: otpSchema,
  })
  .strict();

// Login only needs "something was typed". The password rules apply when a
// password is created, so a later rule change can't lock existing users out.
export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required').max(200),
  })
  .strict();
