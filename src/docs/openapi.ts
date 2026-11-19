// The OpenAPI document behind /docs and /openapi.json.
// tests/integration/docs.test.ts fails if this file and the real routes disagree,
// so add every new route here too.

// ---------- reusable pieces ----------

const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', example: 'VALIDATION_ERROR' },
        message: { type: 'string' },
      },
    },
  },
} as const;

const roleSchema = {
  oneOf: [
    {
      type: 'object',
      required: ['role'],
      properties: { role: { type: 'string', enum: ['customer'] } },
    },
    {
      type: 'object',
      required: ['role', 'isApproved'],
      properties: {
        role: { type: 'string', enum: ['consultant'] },
        isApproved: {
          type: 'boolean',
          description: 'False until an admin approves this consultant.',
        },
      },
    },
    {
      type: 'object',
      required: ['role'],
      properties: { role: { type: 'string', enum: ['admin'] } },
    },
  ],
} as const;

const userSchema = {
  type: 'object',
  required: ['id', 'email', 'name', 'isValid', 'roles'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    name: { type: 'string' },
    isValid: {
      type: 'boolean',
      description:
        'Whether the email was proven with the one-time code. An account is saved as false at register and becomes true when the correct code is submitted. Only true accounts can log in.',
    },
    roles: { type: 'array', items: roleSchema },
  },
} as const;

const json = (schema: object) => ({ 'application/json': { schema } });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

// A response that carries the standard { error: { code, message } } body.
const error = (description: string) => ({ description, content: json(ref('Error')) });

// A response that carries { user }.
const userBody = (description: string, headers?: object) => ({
  description,
  ...(headers ? { headers } : {}),
  content: json({ type: 'object', properties: { user: ref('User') } }),
});

const setCookies = (what: string) => ({
  'Set-Cookie': {
    description: what,
    schema: { type: 'string' },
  },
});

// The error responses nearly every route can return.
const validationError = error('VALIDATION_ERROR: the body or path is not valid.');
const rateLimited = error('RATE_LIMITED: too many requests. Wait for the Retry-After header.');
const notLoggedIn = error(
  'UNAUTHENTICATED (no or invalid access token) or TOKEN_EXPIRED (call POST /auth/refresh, then retry).',
);

const accessCookie = [{ accessToken: [] }];

// ---------- the document ----------

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'SlotBook API',
    version: '0.1.0',
    description: [
      'SlotBook is an appointment booking platform. It connects customers with consultants, so people can book time with the right expert without the back and forth.',
      '',
      '**Customers** create an account, find a consultant and book a time.',
      '',
      '**Consultants** create an account, get approved by the SlotBook team, and then offer their services and time to customers.',
      '',
      '**Admins** are the SlotBook team. They review new consultants and approve them before they go live.',
      '',
      'Everyone signs up with an email address and confirms it with a short code we send them, so every account belongs to a real inbox.',
    ].join('\n'),
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Health', description: 'Check that SlotBook is up and running.' },
    { name: 'Auth', description: 'Create an account, confirm your email and log in.' },
    { name: 'Admin', description: 'For the SlotBook team: review and approve new consultants.' },
  ],
  components: {
    securitySchemes: {
      accessToken: {
        type: 'apiKey',
        in: 'cookie',
        name: 'slotbook_access',
        description: 'Short-lived JWT set by login and signup. Sent automatically by browsers.',
      },
      refreshToken: {
        type: 'apiKey',
        in: 'cookie',
        name: 'slotbook_refresh',
        description: 'Longer-lived JWT. Only sent to POST /auth/refresh.',
      },
    },
    schemas: {
      Error: errorSchema,
      User: userSchema,
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Process is running',
        responses: {
          '200': {
            description: 'The process is up. The database is not checked.',
            content: json({
              type: 'object',
              properties: { status: { type: 'string', example: 'ok' } },
            }),
          },
        },
      },
    },
    '/ready': {
      get: {
        tags: ['Health'],
        summary: 'Database is reachable',
        responses: {
          '200': {
            description: 'The database answered.',
            content: json({
              type: 'object',
              properties: { status: { type: 'string', example: 'ready' } },
            }),
          },
          '503': error('DB_UNAVAILABLE: the database is not reachable.'),
        },
      },
    },

    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Step 1: register and receive a verification code',
        description:
          'Saves the account with isValid false (email not proven yet) and emails a 6-digit code. Always answers 202 the same way, whether or not the email already has a verified account, so this endpoint cannot be used to find registered emails. An existing verified account gets a "you already have an account" email instead of a code. Registering the same unverified email again replaces the earlier attempt, except inside the cooldown (OTP_RESEND_SECONDS), where nothing changes and the earlier code stays valid. Rate limited per IP and per email.',
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['name', 'email', 'password', 'role'],
            additionalProperties: false,
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 80, example: 'Asha' },
              email: { type: 'string', format: 'email', example: 'asha@example.com' },
              password: { type: 'string', minLength: 8, maxLength: 200, example: 'correct-horse' },
              role: {
                type: 'string',
                enum: ['customer', 'consultant'],
                description: 'An admin cannot be created here. A consultant stays unapproved until an admin approves them.',
              },
            },
          }),
        },
        responses: {
          '202': {
            description: 'Request accepted. Nothing is revealed about the email.',
            content: json({
              type: 'object',
              properties: {
                email: { type: 'string', format: 'email' },
                expiresInSeconds: { type: 'integer', example: 600 },
              },
            }),
          },
          '400': validationError,
          '429': rateLimited,
          '503': error('EMAIL_FAILED (production only): the code could not be emailed.'),
        },
      },
    },

    '/auth/register/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Step 2: submit the code to verify the email',
        description:
          'The correct code sets isValid to true and logs the user in: the access and refresh cookies are set. Every way a code can fail (missing, expired, wrong, too many tries) returns the same OTP_INVALID. After OTP_MAX_ATTEMPTS wrong codes the unverified account is deleted and the user must register again.',
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['email', 'otp'],
            additionalProperties: false,
            properties: {
              email: { type: 'string', format: 'email', example: 'asha@example.com' },
              otp: { type: 'string', pattern: '^\\d{6}$', example: '123456' },
            },
          }),
        },
        responses: {
          '201': userBody(
            'Email verified (isValid is now true) and logged in.',
            setCookies('slotbook_access (all paths) and slotbook_refresh (refresh path only).'),
          ),
          '400': validationError,
          '401': error('OTP_INVALID: the code is missing, expired, wrong or used up.'),
          '429': rateLimited,
        },
      },
    },

    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in with email and password',
        description:
          'The same URL for every role. A wrong email and a wrong password return the same 401. Sets the access and refresh cookies. Rate limited per IP and per email.',
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['email', 'password'],
            additionalProperties: false,
            properties: {
              email: { type: 'string', format: 'email', example: 'asha@example.com' },
              password: { type: 'string', example: 'correct-horse' },
            },
          }),
        },
        responses: {
          '200': userBody(
            'Logged in.',
            setCookies('slotbook_access (all paths) and slotbook_refresh (refresh path only).'),
          ),
          '400': validationError,
          '401': error('INVALID_CREDENTIALS: wrong email or password.'),
          '429': rateLimited,
        },
      },
    },

    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Get a new access token',
        description:
          'Call this when a request answers 401 TOKEN_EXPIRED. Reads the refresh cookie, checks the account is still active and its token version is current, and sets a new access token with up-to-date roles. The refresh token is not replaced, so the login still ends 24 hours after it started.',
        security: [{ refreshToken: [] }],
        responses: {
          '200': userBody('New access token set.', setCookies('slotbook_access.')),
          '401': error('REFRESH_TOKEN_INVALID: expired, revoked or invalid. Log in again.'),
          '429': rateLimited,
        },
      },
    },

    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Log out on this device',
        description:
          'Clears both cookies. Needs no login, so it is safe to call when already logged out. The tokens are not revoked server-side; use /auth/logout-all for that.',
        responses: { '204': { description: 'Cookies cleared.' } },
      },
    },

    '/auth/logout-all': {
      post: {
        tags: ['Auth'],
        summary: 'Log out on every device',
        description:
          'Bumps the account token version so every refresh token stops working. Access tokens already issued expire on their own within 15 minutes.',
        security: accessCookie,
        responses: {
          '204': { description: 'All refresh tokens revoked. Cookies cleared.' },
          '401': notLoggedIn,
        },
      },
    },

    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'The logged-in account',
        description: 'Read fresh from the database, so it is always up to date.',
        security: accessCookie,
        responses: {
          '200': userBody('Current user.'),
          '401': notLoggedIn,
        },
      },
    },

    '/admin/consultants': {
      get: {
        tags: ['Admin'],
        summary: 'Consultants waiting for approval',
        security: accessCookie,
        responses: {
          '200': {
            description: 'Verified consultants whose isApproved is false.',
            content: json({
              type: 'object',
              properties: { consultants: { type: 'array', items: ref('User') } },
            }),
          },
          '401': notLoggedIn,
          '403': error('FORBIDDEN: logged in, but not an admin.'),
        },
      },
    },

    '/admin/consultants/{userId}/approve': {
      post: {
        tags: ['Admin'],
        summary: 'Approve a consultant',
        description:
          'Only a verified consultant can be approved. The first approval emails the consultant (best effort, in the background); approving again changes nothing and sends nothing. The consultant sees the change after their next refresh (up to 15 minutes), because roles ride in the access token.',
        security: accessCookie,
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': userBody('isApproved is now true. Approving again returns the same user.'),
          '400': validationError,
          '401': notLoggedIn,
          '403': error('FORBIDDEN: not an admin.'),
          '404': error('CONSULTANT_NOT_FOUND: that id is not a consultant.'),
        },
      },
    },
  },
} as const;
