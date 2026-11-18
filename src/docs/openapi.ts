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
      description: 'True only after the signup OTP has been confirmed.',
    },
    roles: { type: 'array', items: roleSchema },
  },
} as const;

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'SlotBook API',
    version: '0.1.0',
    description:
      'Appointment API. Signup chooses customer or consultant, then proves the email with a one-time code before the account exists. Login is email and password for every role. A consultant stays unapproved until an admin allows them. The code is emailed when SMTP is configured. In development without SMTP it is printed in the server log.',
  },
  servers: [{ url: '/' }],
  tags: [{ name: 'Health' }, { name: 'Auth' }, { name: 'Admin' }],
  components: {
    securitySchemes: {
      session: {
        type: 'apiKey',
        in: 'cookie',
        name: 'slotbook_session',
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
            content: {
              'application/json': {
                schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } },
              },
            },
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
            content: {
              'application/json': {
                schema: { type: 'object', properties: { status: { type: 'string', example: 'ready' } } },
              },
            },
          },
          '503': {
            description: 'The database is not reachable.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Start signup and issue an OTP',
        description:
          'Does not create the account. The same email can start again: a new code replaces the previous one, and expired rows are deleted. The code is sent to this email when SMTP is configured. Calling this again within 60 seconds returns 429.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password', 'role'],
                properties: {
                  name: { type: 'string', example: 'Asha' },
                  email: { type: 'string', format: 'email', example: 'asha@example.com' },
                  password: { type: 'string', minLength: 8, example: 'correct-horse' },
                  role: { type: 'string', enum: ['customer', 'consultant'] },
                },
              },
            },
          },
        },
        responses: {
          '202': {
            description: 'A code was created. The account does not exist yet.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', format: 'email' },
                    expiresInSeconds: { type: 'integer', example: 600 },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid body, including an admin role.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '409': { description: 'A finished account already uses this email.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'A code was sent less than a minute ago.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/register/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Confirm the OTP and create the account',
        description:
          'A customer is created with isValid true. A consultant is created with isValid true and isApproved false. Sets the session cookie.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'otp'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  otp: { type: 'string', pattern: '^\\d{6}$', example: '123456' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Account created and session started.',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } },
              },
            },
          },
          '401': {
            description: 'Missing, expired, wrong, or over-tried code.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in with email and password',
        description:
          'The same URL for every role. The response includes isValid and, for a consultant, isApproved. A wrong email and a wrong password return the same 401.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Session started.',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } },
              },
            },
          },
          '401': { description: 'Invalid email or password.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'End the session',
        security: [{ session: [] }],
        responses: { '204': { description: 'Session deleted and cookie cleared.' } },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'The logged-in account',
        security: [{ session: [] }],
        responses: {
          '200': {
            description: 'Current user.',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } },
              },
            },
          },
          '401': { description: 'Missing or expired session.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/admin/consultants': {
      get: {
        tags: ['Admin'],
        summary: 'Consultants waiting for approval',
        security: [{ session: [] }],
        responses: {
          '200': {
            description: 'Verified consultants whose isApproved is false.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { consultants: { type: 'array', items: { $ref: '#/components/schemas/User' } } },
                },
              },
            },
          },
          '401': { description: 'Not logged in.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Logged in, but not an admin.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/admin/consultants/{userId}/approve': {
      post: {
        tags: ['Admin'],
        summary: 'Approve a consultant',
        security: [{ session: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'isApproved is now true. Approving again returns the same user.',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } },
              },
            },
          },
          '401': { description: 'Not logged in.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Not an admin.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'That id is not a consultant.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
  },
};
