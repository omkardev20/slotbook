import { z } from 'zod';

// Every value in process.env is a string or undefined. This schema describes
// what the app actually needs, so a missing or wrong value crashes at startup
// with a clear message instead of failing later inside a request.
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // coerce: turns the string "3000" into the number 3000.
    PORT: z.coerce.number().int().positive().default(3000),
    TURSO_DATABASE_URL: z.url({ protocol: /^(libsql|file|https?)$/ }),
    // Optional: a local file: database needs no token.
    TURSO_AUTH_TOKEN: z.string().min(1).optional(),
    SESSION_SECRET: z.string().min(32),
    // Both empty, or both set. Used only by `npm run seed:admin`.
    ADMIN_EMAIL: optionalEnv(z.email()),
    ADMIN_PASSWORD: optionalEnv(z.string().min(8).max(200)),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.ADMIN_EMAIL) !== Boolean(value.ADMIN_PASSWORD)) {
      ctx.addIssue({
        code: 'custom',
        message: 'ADMIN_EMAIL and ADMIN_PASSWORD must both be set, or both left empty',
        path: ['ADMIN_EMAIL'],
      });
    }
  });

function optionalEnv<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  );
}

// safeParse never throws; it returns { success, data } or { success, error }.
const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:\n' + z.prettifyError(result.error));
  process.exit(1);
}

// The type is inferred from the schema — no separate interface needed.
export const env = result.data;
