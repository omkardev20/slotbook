import { z } from 'zod';

// Every value in process.env is a string or undefined. This schema describes
// what the app actually needs, so a missing or wrong value crashes at startup
// with a clear message instead of failing later inside a request.
const envSchema = z
  .object({
    // Fails closed: forgetting NODE_ENV on a server means production rules
    // (Secure cookies, no OTP printed to logs), never dev rules.
    NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
    // coerce: turns the string "3000" into the number 3000.
    PORT: z.coerce.number().int().positive().default(3000),
    TURSO_DATABASE_URL: z.url({ protocol: /^(libsql|file|https?)$/ }),
    // Optional: a local file: database needs no token.
    TURSO_AUTH_TOKEN: z.string().min(1).optional(),
    // Two separate secrets: one signs login tokens, one hashes email codes.
    JWT_SECRET: z.string().min(32),
    OTP_SECRET: z.string().min(32),
    // Short-lived token sent with every request.
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().positive().default(15),
    // How long the refresh token keeps working AFTER the access token expires.
    // Login lasts ACCESS + REFRESH in total (15 + 1425 min = 24 hours).
    REFRESH_TOKEN_TTL_MINUTES: z.coerce.number().positive().default(1425),
    // Email verification code rules.
    OTP_TTL_MINUTES: z.coerce.number().positive().max(60).default(10),
    // Minimum 30s: this cooldown is what stops someone resetting the attempt
    // counter over and over, so it must not be switched off.
    OTP_RESEND_SECONDS: z.coerce.number().int().min(30).default(60),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
    // Rate limits. The window is shared; each route group has its own cap.
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    // login, verify, refresh: per IP, and login also per email.
    RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(10),
    // register sends an email, so it is stricter: per IP and per email.
    RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().positive().default(5),
    // How many reverse proxies sit in front of the app (Render = 1, local = 0).
    // Needed so req.ip is the real client and not the proxy.
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    // Public address of the web app. When set, emails get a "Log in" button pointing here.
    APP_URL: optionalEnv(z.url({ protocol: /^https?$/ })),
    // Frontend origin allowed to call the API with cookies, e.g. http://localhost:5173.
    CORS_ORIGIN: optionalEnv(z.url()),
    // Path the refresh cookie is sent to. Behind an /api proxy, use /api/auth/refresh.
    REFRESH_COOKIE_PATH: z.string().startsWith('/').default('/auth/refresh'),
    // Sender shown on the verification email. Delivery also needs the SMTP settings.
    MAIL_FROM: optionalEnv(z.email()),
    SMTP_HOST: optionalEnv(z.string().min(1)),
    SMTP_PORT: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.coerce.number().int().positive().default(587),
    ),
    SMTP_USER: optionalEnv(z.string().min(1)),
    SMTP_PASS: optionalEnv(z.string().min(1)),
    // Both empty, or both set. Used only by `npm run seed:admin`.
    // Lowercased here so it matches how login looks emails up.
    ADMIN_EMAIL: optionalEnv(z.string().trim().toLowerCase().pipe(z.email())),
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
