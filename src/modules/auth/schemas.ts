import { z } from 'zod';
import {
  emailSchema,
  idSchema,
  nameSchema,
  otpSchema,
  passwordSchema,
  signupRoleSchema,
} from '../../lib/validators.ts';

export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    role: signupRoleSchema,
  })
  .strict();

export const verifySignupSchema = z
  .object({
    email: emailSchema,
    otp: otpSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const userIdParamsSchema = z.object({
  userId: idSchema,
});
