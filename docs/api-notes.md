# API notes for developers

The Swagger intro (`/docs`) is written for non-technical readers. The technical
details that used to live there are kept here.

## Signup

Two steps. `POST /auth/register` takes name, email, password and role, saves the
account with `isValid: false` and emails a 6-digit code. `POST /auth/register/verify`
takes the email and code: the correct code sets `isValid: true` and logs the user in.
Unverified accounts cannot log in and are deleted when their code expires.

## Login and tokens

Login sets two JWT cookies, both HttpOnly.

- **Access token** (default 15 minutes, `ACCESS_TOKEN_TTL_MINUTES`): sent with every request.
- **Refresh token** (only sent to `/auth/refresh`): gets a new access token when a request
  answers `401 TOKEN_EXPIRED`. A login ends 24 hours after it started and cannot be extended
  by refreshing. Browser clients need `credentials: "include"`.
- `POST /auth/logout-all` bumps the account's `token_version`, which kills every refresh token.

## Roles

A customer is active immediately. A consultant stays unapproved until an admin approves them.
Roles are read from the access token, so a role change can take up to 15 minutes to show,
or until the next refresh.

## Responses

- Every response carries an `X-Request-Id` header. Quote it when reporting a problem.
- Errors always look like `{ "error": { "code", "message" } }`.

## Email

The code is emailed when SMTP is configured. In development without working SMTP it is
printed in the server log.
