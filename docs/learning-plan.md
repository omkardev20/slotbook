# SlotBook API — Express Backend & Free Cloud Learning Plan

This file is the working plan for learning backend engineering and cloud
by building SlotBook. It builds on `slotbook_backend_learning_context.md`
and changes three decisions in it:

| Topic | Original context | This plan |
|---|---|---|
| Web framework | Fastify | **Express.js** |
| Main database | PostgreSQL in Docker | **Turso** (hosted libSQL, SQLite-compatible), free tier; local SQLite file for tests |
| Docker | Early (Milestone 2) | **Last skill before deployment** |

Everything else in the original document still applies: the mentor
rules, backend-first approach, booking correctness, and the "learn by
doing, not by pasting" philosophy.

---

## 1. Goal

Become a backend developer who can pass interviews for **~1 year of
experience** and can independently:

- Design and build a REST API with Node.js, TypeScript and Express
- Model relational data, write SQL, and use constraints, indexes,
  migrations and transactions
- Prevent race conditions such as two people booking the same slot
- Build authentication and **role-based access control (RBAC)** with
  ownership checks
- Use Redis for what it is good at (rate limiting, caching) and explain
  why it is not the source of truth
- Test, log, configure, containerise and deploy a backend to the cloud
  for free
- Explain every decision in an interview without relying on AI

The frontend is deliberately simple: plain HTML, CSS and JavaScript using
`fetch`. It exists to exercise the API (CORS, cookies, errors), not to
learn frontend.

**The frontend lives in its own repository** (e.g. `slotbook-web`) and is
deployed independently. This repository is the API only. Because the
two run on different origins, CORS and cookie settings are a deliberate
part of the backend design (see section 6.8).

---

## 2. How we work (mentor rules)

1. **Explain** one concept: what problem it solves and why it matters.
2. **Task**: one small, specific thing to do in my own terminal/editor.
3. **My attempt**: I write the code or run the command.
4. **Verify**: how to test it and what output to expect.
5. **Review**: I paste code/output/errors; the AI reviews what I actually
   shared.
6. **Teach from mistakes**: hints first, then a guided explanation.
7. **Advance** only when the milestone is understood.

Rules for the AI:

- Do not generate the whole backend or dump complete files unless I ask.
- Never claim something works without evidence I shared.
- Explain every command and flag; warn before anything destructive.
- npm only (no yarn/pnpm). Bash/Linux syntax. Ubuntu on a ThinkPad T470.
- Verify tool versions instead of assuming them.
- Ask one focused question if context is missing.

---

## 3. Tech stack (all free)

### Local tools

| Tool | Purpose | Notes |
|---|---|---|
| Node.js 22 LTS (via nvm) | Runtime | Check with `node -v`; don't assume |
| npm 10 | Package manager | |
| TypeScript | Types on the server | `tsx` for running in dev, `tsc` for builds |
| **Express 5** | HTTP framework | Express 5 forwards rejected promises from async handlers to the error middleware; verify version with `npm view express version` |
| `@libsql/client` | Turso database driver | Raw parameterised SQL (`?` placeholders), no ORM. Same client works with `libsql://` (Turso) and `file:` (local SQLite) URLs |
| Plain `.sql` files + a small migration runner I write | Migrations | Repeatable, version-controlled schema; the runner records applied files in a `schema_migrations` table |
| `luxon` | Time-zone conversion | SQLite has no time-zone database, so local ↔ UTC conversion happens in the app |
| `zod` | Input validation at the API boundary | |
| `argon2` | Password hashing | Never a homemade scheme |
| `pino` + `pino-http` | Structured logging | |
| `helmet`, `cors` | HTTP security headers, cross-origin rules | |
| `express-rate-limit` + Redis store | Rate limiting | Redis store comes in the Redis milestone |
| Vitest + Supertest | Unit and integration tests | |
| ESLint + Prettier | Code quality | |
| curl (optional: Bruno / Thunder Client) | Manual API testing | |
| Git + GitHub | Version control and CI | |
| Docker + Docker Compose | **Last milestone before deploy** | |

Exact versions are chosen when we install, after checking compatibility.

### Free cloud services

Checked against provider pages in **October 2026**. Free tiers change —
re-check before relying on them.

| Service | Role in SlotBook | Free limits | Watch out for |
|---|---|---|---|
| **Turso** (libSQL, SQLite-compatible) | Main database from day one | 100 databases, 5 GB storage, 500M rows read and 10M rows written per month, 1-day point-in-time restore, no card, no cold starts | Exceeding **any** quota blocks the databases until next month. Rows *scanned* count as reads, so a missing index burns quota. Use a separate `slotbook-test` database or a local file for tests. |
| **Upstash Redis** | Rate limiting, slot cache, optional session store | 1 database, 250 MB, 500K commands/month, no card | **Do not add a payment card** — adding one moves all free resources to paid plans. |
| **Aiven MySQL** or **TiDB Cloud Starter** | MySQL comparison lab only | Aiven: 1 GB storage, 1 GB RAM, single node. TiDB: 5 GiB, 50M request units/month | Aiven may power off idle services. PlanetScale has **no** free tier. |
| **Neon** (Postgres) | Postgres comparison lab only (Milestone 9) | 1 GB storage/project, 100 CU-hours/project/month, scales to zero after 5 min idle, no card | Interviews often ask about Postgres; this lab gives hands-on experience with range types and exclusion constraints |
| **GitHub Actions** | CI: lint, type-check, test | Free for public repos | Keep secrets in GitHub Secrets |
| **Render** (free web service) | Hosting the Express API | 750 instance-hours/month, 512 MB RAM, no card | Sleeps after 15 min idle (~1 min wake). Render's free Postgres expires 30 days after creation — not used. The database stays on Turso. |
| Netlify, Vercel or Render static site | Hosting the separate frontend repo | Free static hosting | Prefer a host that can **proxy** `/api/*` to the API (see section 6.8); re-check its free limits |

### Why Turso is the main database — and what that costs

Turso is a hosted database built on libSQL, an open-source fork of
SQLite. My app talks to it over the network with `@libsql/client`, using
normal SQL.

What Turso/SQLite gives SlotBook:

- **Writes are serialised**: only one write transaction runs at a time
  per database. A check-and-insert done inside one write transaction (or
  inside a trigger) cannot race with another booking.
- Transactions are serializable, foreign keys, `CHECK` and `UNIQUE`
  constraints, partial and expression indexes, triggers, `RETURNING`,
  `STRICT` tables
- The same SQL runs on a **local SQLite file**, so tests are fast, free
  and do not touch the cloud quota
- Generous free tier with no cold starts

What it does **not** have (compared with Postgres), and how SlotBook
handles it:

| Missing | SlotBook's approach |
|---|---|
| Range types (`tstzrange`) and exclusion constraints | Store `start_at` / `end_at` as integers; a **trigger** rejects overlapping confirmed bookings (section 5.6) |
| `timestamptz` and built-in time zones | Store instants as **UTC epoch milliseconds** (`INTEGER`); convert with `luxon` in the app |
| Strict column types by default | Use `STRICT` tables so a text value cannot sneak into an integer column |
| Boolean, UUID, JSONB types | `INTEGER` 0/1 with a `CHECK`; `TEXT` IDs from `crypto.randomUUID()`; `TEXT` JSON with SQLite JSON functions |
| Row-level locks, many concurrent writers | One writer at a time — fine for SlotBook's scale, a known limit for write-heavy systems |

Postgres (Neon) and MySQL are **comparison labs** in Milestone 9, so I
can answer interview questions about them from experience.

### Why Redis is not the source of truth

Redis is fast memory with optional persistence. A cache can be stale or
empty. If Redis is flushed, SlotBook must still refuse a double booking,
because the Turso database enforces that rule. Redis makes things faster or
protects endpoints; it never decides whether a booking is valid.

---

## 4. Product scope

### 4.1 Concept

SlotBook is an appointment booking backend. Customers discover
consultants, see free slots, book them, and cancel under a policy.
Consultants manage their profile, services, weekly availability and
blocked time. Admins moderate the platform.

### 4.2 Actors

| Actor | Description |
|---|---|
| Guest | Not logged in. Can browse public consultant data. |
| Customer | Registered user who books appointments. |
| Consultant | Registered user who offers services and receives bookings. Must be approved by an admin before appearing publicly. |
| Admin | Platform operator. Approves consultants, suspends users, sees all bookings. |

### 4.3 MVP features (in scope)

**Accounts and identity**
- Register (customer by default), log in, log out, get current user
- Apply to become a consultant; admin approves or rejects
- Change password
- Suspend/unsuspend a user (admin)

**Consultant profile and services**
- Consultant edits own profile: display name, bio, IANA time zone (e.g.
  `Asia/Kolkata`)
- Consultant creates/updates/archives own services: name, duration in
  minutes, price (stored as integer minor units, e.g. paise), buffer
  minutes
- Public listing of approved consultants with pagination, filtering and
  sorting

**Availability**
- Weekly rules in the consultant's local time (e.g. Monday 09:00–13:00
  and 14:00–18:00)
- Exceptions: block a whole date or a time range; optionally add extra
  hours on a date
- Query free slots for a service over a date range (max range enforced,
  e.g. 14 days)

**Bookings**
- Customer books a slot for a service
- Customer lists own bookings (upcoming/past, filter by status)
- Consultant lists bookings on their calendar
- Customer cancels under policy; consultant cancels with a reason
- Consultant marks a booking completed or no-show after it ends
- Admin views any booking

**Quality**
- Consistent JSON error format
- Input validation on every endpoint
- Automated tests for important flows, failure paths, permissions and
  concurrency
- Structured logs with request IDs
- Health and readiness endpoints
- Rate limiting on login and booking creation
- OpenAPI documentation

### 4.4 Out of scope (for now)

Payments, video calls, real email/SMS delivery, external calendar sync,
complex recurring appointments, AI features, microservices, Kubernetes,
multi-tenant organisations.

### 4.5 Stretch goals (only after MVP is correct)

- Temporary slot **holds** (reserve for 5 minutes during checkout) with
  expiry
- **Outbox pattern**: write "booking confirmed" events to an `outbox`
  table in the same transaction; a worker process logs/"sends"
  notifications
- Audit log of admin actions
- Idempotency keys on `POST /bookings`
- Refresh tokens or session store moved to Redis
- Fine-grained permissions table (see RBAC phase 2)

---

## 5. Business rules

### 5.1 Time

- All instants are stored as **UTC epoch milliseconds** in `INTEGER`
  columns (e.g. `start_at`). Integers compare and index correctly and
  have no time-zone ambiguity. The API converts them to ISO 8601.
- Each consultant has an IANA time zone. Weekly rules are local
  wall-clock times; they are converted to UTC instants per date.
- Intervals are half-open: `[start, end)`. A booking ending at 11:00 does
  not conflict with one starting at 11:00.
- Daylight-saving decisions must be written down and tested: slots that
  fall in a non-existent local time are skipped; ambiguous times use the
  first occurrence. (Asia/Kolkata has no DST, so tests use a zone such
  as `Europe/London` or `America/New_York`.)
- The API accepts and returns ISO 8601 with an offset (e.g.
  `2026-11-02T10:00:00+05:30` or `...Z`).

### 5.2 Slot generation

A slot is offered only if all of these hold:

- It fits completely inside a weekly rule window (or an "extra hours"
  exception) on that local date
- It does not overlap a blocked exception
- It does not overlap an existing blocking booking (including buffer
  time)
- It starts at least the minimum notice in the future (e.g. 2 hours)
- It is within the maximum advance window (e.g. 60 days)
- Slot starts align to a step (e.g. every 15 or 30 minutes)

The client's chosen slot is **never trusted**: booking creation
re-validates everything inside a transaction.

### 5.3 Booking lifecycle

```
            create
              │
              ▼
         ┌──────────┐  customer cancels (before cutoff)  ┌──────────────────────┐
         │confirmed │ ─────────────────────────────────► │cancelled_by_customer │
         └──────────┘                                    └──────────────────────┘
          │   │   │     consultant/admin cancels         ┌────────────────────────┐
          │   │   └────────────────────────────────────► │cancelled_by_consultant │
          │   │                                          └────────────────────────┘
          │   │  after end, consultant marks              ┌──────────┐
          │   └─────────────────────────────────────────► │completed │
          │      after end, consultant marks              ┌─────────┐
          └─────────────────────────────────────────────► │ no_show │
                                                          └─────────┘
```

- Only `confirmed` (and `held` if holds are added later) **blocks time**.
- Terminal states cannot transition further.
- Invalid transitions return `409 Conflict`.

### 5.4 Cancellation policy

- Customer can cancel up to **24 hours** before start. After that,
  `409` with a clear error code (e.g. `CANCELLATION_WINDOW_CLOSED`).
- Consultant can cancel any future booking with a required reason.
- Admin can cancel any booking.
- Cancelling twice is safe (idempotent behaviour is defined and tested).

### 5.5 Booking snapshots

A booking copies `service_name`, `duration_minutes` and `price_minor` at
booking time, so history stays correct if the service changes later.

### 5.6 Double-booking protection (core milestone)

- Naive "check then insert" is unsafe under concurrency — this is
  demonstrated with a failing test first.
- Each booking stores `start_at`, `end_at` and `block_end_at`
  (`end_at` + buffer) as UTC epoch milliseconds.
- Two intervals `[a, b)` and `[c, d)` overlap when `a < d AND c < b`.
- Fix: a `BEFORE INSERT` **trigger** (and a matching `BEFORE UPDATE`
  trigger for status/time changes) on `bookings` that runs
  `RAISE(ABORT, 'SLOT_UNAVAILABLE')` if another `confirmed` booking for
  the same consultant overlaps the new one.
- Why this is concurrency-safe on Turso: SQLite allows only one write
  transaction at a time, and the trigger runs inside the inserting
  statement while it holds the write lock. Two competing inserts are
  executed one after the other; the second sees the first and aborts.
- The trigger error is mapped to `409 SLOT_UNAVAILABLE`. (Inspect the
  real error object from `@libsql/client` to see its `code` and
  message before writing the mapping.)
- A partial index on `bookings(consultant_id, start_at) WHERE status =
  'confirmed'` keeps the trigger's lookup fast and cheap in row reads.
- Verify in Milestone 2 that Turso accepts triggers and enforces
  foreign keys (`PRAGMA foreign_keys;`).
- The safety argument depends on the single-writer model. Turso's newer
  engine is adding concurrent writes (`BEGIN CONCURRENT`); if SlotBook
  ever uses that, the overlap rule must be re-checked and re-tested.
- Alternatives studied for interviews: an explicit write transaction
  (`client.transaction('write')`, i.e. `BEGIN IMMEDIATE`) that checks
  then inserts; Postgres exclusion constraints; `SELECT ... FOR UPDATE`
  in MySQL/Postgres (seen in the Milestone 9 lab).
- Proof: a test fires many concurrent booking requests for the same
  slot; exactly one succeeds. Run it on the local file **and** once on a
  real Turso test database, because network behaviour differs.

---

## 6. RBAC — roles, permissions and ownership

### 6.1 Concepts

- **Authentication** — who are you? (login, session/token)
- **Authorization** — what may you do?
- **RBAC** — permissions are granted to roles; users get roles.
- **Ownership (resource-level authorization)** — even with the right
  role, you can only touch *your* data. RBAC alone does not stop
  customer A reading customer B's booking.

Both checks are needed on almost every protected endpoint.

### 6.2 Roles

| Role | How it is obtained |
|---|---|
| `customer` | Default on registration |
| `consultant` | Granted when an admin approves a consultant application |
| `admin` | Seeded via a migration/script, never through a public endpoint |

A user can hold more than one role (a consultant may also book other
consultants), so roles live in a `user_roles` table, not a single
column.

Account status is separate from roles: `active` or `suspended`.
Suspended users cannot log in, and existing sessions are rejected.

### 6.3 Permission matrix

`own` = only resources the user owns. `—` = not allowed.

| Permission | Guest | Customer | Consultant | Admin |
|---|---|---|---|---|
| `consultants:read` (approved, public fields) | ✅ | ✅ | ✅ | ✅ (incl. unapproved) |
| `availability:read` (free slots) | ✅ | ✅ | ✅ | ✅ |
| `auth:register` / `auth:login` | ✅ | — | — | — |
| `me:read` / `me:update` / `password:change` | — | own | own | own |
| `consultant_application:create` | — | ✅ | — | — |
| `consultant_application:review` | — | — | — | ✅ |
| `consultant_profile:update` | — | — | own | ✅ |
| `services:create` / `update` / `archive` | — | — | own | ✅ |
| `availability_rules:manage` | — | — | own | ✅ |
| `availability_exceptions:manage` | — | — | own | ✅ |
| `bookings:create` | — | ✅ | ✅ (not with self) | — |
| `bookings:read` | — | own (as customer) | own (as customer or consultant) | all |
| `bookings:cancel` | — | own, before cutoff | own calendar, with reason | all |
| `bookings:complete` / `bookings:no_show` | — | — | own calendar, after end | ✅ |
| `users:list` / `users:suspend` | — | — | — | ✅ |

### 6.4 Implementation phases

**Phase 1 (MVP)** — roles in `user_roles`, permissions mapped in code:

- `requireAuth` middleware: loads the session/token, rejects with `401`
  if missing/invalid, rejects suspended users.
- `requirePermission('bookings:cancel')` middleware: checks the user's
  roles against the permission map, `403` if not allowed.
- Ownership checks in the service layer, enforced in SQL where possible
  (e.g. `WHERE id = $1 AND customer_id = $2`).

**Phase 2 (stretch)** — data-driven RBAC:

- Tables `roles`, `permissions`, `role_permissions`, `user_roles`.
- Discuss tradeoffs: flexibility vs. complexity, caching permissions,
  what happens when a role changes while a session is active.

### 6.5 Status-code rules

| Situation | Response |
|---|---|
| Not logged in / invalid session | `401 Unauthorized` |
| Logged in but role lacks the permission | `403 Forbidden` |
| Has the permission but the resource belongs to someone else | `404 Not Found` (do not reveal it exists) |
| Allowed but the business rule forbids it (cancel too late) | `409 Conflict` |
| Bad input | `400 Bad Request` / `422` (pick one and be consistent) |

### 6.6 RBAC tests (required)

- Every protected endpoint returns `401` without credentials.
- Customer cannot call consultant/admin endpoints (`403`).
- Customer A cannot read, cancel or list customer B's bookings.
- Consultant A cannot edit consultant B's services or availability.
- Consultant cannot book themselves.
- Suspended user is rejected even with a previously valid session.
- Admin-only endpoints reject everyone else.
- Role change (approval) takes effect as designed.

### 6.7 Authentication design

Default: **server-side sessions** in an HTTP-only cookie.

- Session table in Turso (later optionally Redis).
- Cookie flags: `HttpOnly`, `Secure` (in production), `SameSite=Lax`,
  sensible expiry.
- Regenerate session ID on login; destroy on logout.
- CSRF protection decision is documented (SameSite + origin check or a
  CSRF token).
- Passwords hashed with Argon2id; generic error message on bad login (no
  user enumeration).
- Login rate-limited.

JWT access + refresh tokens are studied for interviews (stateless vs
revocation, storage in the browser, token rotation) and may be built as
an optional comparison.

### 6.8 Separate frontend: CORS and cookies

The frontend repo and this API run on different origins (an origin is
scheme + domain + port). That affects authentication:

- **Local development:** e.g. frontend on `http://localhost:5500`, API
  on `http://localhost:3000`. Different origins, but the same *site*
  (port is ignored for "site"), so a `SameSite=Lax` cookie is still
  sent. The API needs CORS with an explicit origin allow-list and
  `credentials: true`; the frontend uses `fetch(..., { credentials:
  'include' })`. `Access-Control-Allow-Origin: *` does **not** work with
  credentials.
- **Deployed on two free subdomains** (e.g. `slotbook-web.netlify.app`
  and `slotbook-api.onrender.com`): these are different *sites*. A
  `SameSite=Lax` cookie will not be sent, and `SameSite=None; Secure`
  cookies are treated as third-party cookies, which Safari, Firefox
  (strict mode) and Brave block. Login would appear to work and then
  every request would be `401`.

Options, decided in Milestone 12:

| Option | How | Tradeoff |
|---|---|---|
| **Proxy (default)** | Frontend host rewrites `/api/*` to the Render API (e.g. Netlify `_redirects` with status `200`, Vercel `rewrites`) | Browser sees one origin, so `SameSite=Lax` sessions and simple CSRF rules keep working; the API still enforces CORS for local dev |
| Bearer tokens | API returns a token; frontend sends `Authorization: Bearer ...` | No cookie problems, but the token is readable by JavaScript (XSS risk) and revocation needs extra design |
| Custom domain | `app.example.com` + `api.example.com` are the same site | Cleanest, but a domain costs money (breaks the free rule) |

Whatever is chosen: CORS allow-list from an env var (`CORS_ORIGINS`),
`app.set('trust proxy', 1)` behind Render's proxy, and an `Origin`
check on state-changing requests.

---

## 7. Data model (starting point — evolves through migrations)

All tables are `STRICT`. IDs are `TEXT` UUIDs generated in the app.
Instants are `INTEGER` UTC epoch milliseconds. Booleans are `INTEGER`
with `CHECK (x IN (0, 1))`.

| Table | Key columns | Important constraints |
|---|---|---|
| `users` | `id`, `email` (stored lowercased), `password_hash`, `full_name`, `status`, `created_at` | unique email, check status |
| `user_roles` | `user_id`, `role` | PK (user_id, role), check role in (...) |
| `sessions` | `id`, `user_id`, `expires_at`, `created_at` | FK users, index on expires_at |
| `consultant_applications` | `id`, `user_id`, `status`, `reviewed_by`, `reviewed_at` | one pending application per user (partial unique index) |
| `consultant_profiles` | `user_id`, `display_name`, `bio`, `time_zone`, `is_approved` | PK = FK users, time zone validated |
| `services` | `id`, `consultant_id`, `name`, `duration_minutes`, `price_minor`, `buffer_minutes`, `is_active` | duration > 0, price >= 0 |
| `availability_rules` | `id`, `consultant_id`, `weekday`, `start_local`, `end_local` | weekday 0–6, start < end, no overlapping rules per weekday |
| `availability_exceptions` | `id`, `consultant_id`, `kind` (`blocked`/`extra`), `start_at`, `end_at` | `start_at < end_at` |
| `bookings` | `id`, `consultant_id`, `customer_id`, `service_id`, `start_at`, `end_at`, `block_end_at`, `status`, snapshot columns, `cancel_reason`, timestamps | overlap **triggers** for confirmed bookings, `start_at < end_at <= block_end_at`, customer ≠ consultant, check status |
| `schema_migrations` | `name`, `applied_at` | PK name — written by my migration runner |
| `outbox` (stretch) | `id`, `event_type`, `payload` (JSON text), `processed_at` | |
| `audit_logs` (stretch) | `id`, `actor_id`, `action`, `target`, `created_at` | |

Indexes are added from real query patterns (e.g. bookings by
`customer_id, start_at` and by `consultant_id, start_at`), and each index
is justified with `EXPLAIN QUERY PLAN`. On Turso, an index also saves
money: rows scanned count against the monthly read quota.

---

## 8. API scope (`/api/v1`)

**Health**
- `GET /health` — process is alive
- `GET /ready` — database (and Redis, once used) reachable

**Auth**
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/change-password`

**Consultants (public)**
- `GET /consultants?search=&page=&limit=&sort=`
- `GET /consultants/:id`
- `GET /consultants/:id/services`
- `GET /consultants/:id/availability?serviceId=&from=&to=`

**Consultant self-service** (role: consultant)
- `POST /consultant-applications` (role: customer)
- `PATCH /me/consultant-profile`
- `POST /me/services`, `PATCH /me/services/:id`, `POST /me/services/:id/archive`
- `GET /me/availability-rules`, `PUT /me/availability-rules`
- `GET /me/availability-exceptions`, `POST /me/availability-exceptions`, `DELETE /me/availability-exceptions/:id`
- `GET /me/calendar?from=&to=&status=`

**Bookings**
- `POST /bookings`
- `GET /bookings/me?status=&from=&to=&page=`
- `GET /bookings/:id`
- `POST /bookings/:id/cancel`
- `POST /bookings/:id/complete`
- `POST /bookings/:id/no-show`

**Admin**
- `GET /admin/consultant-applications?status=pending`
- `POST /admin/consultant-applications/:id/approve`
- `POST /admin/consultant-applications/:id/reject`
- `GET /admin/users`, `POST /admin/users/:id/suspend`, `POST /admin/users/:id/unsuspend`
- `GET /admin/bookings`

Routes are built only when their milestone arrives, not all at once.

**Error format (consistent everywhere):**

```json
{
  "error": {
    "code": "SLOT_UNAVAILABLE",
    "message": "That time is no longer available.",
    "requestId": "b3c1..."
  }
}
```

---

## 9. Suggested project structure

A small modular monolith — grouped by feature, not by technical layer.

```
slotbook/
  src/
    app.ts              # builds the Express app (no listen) — used by tests
    server.ts           # starts listening, handles shutdown
    config/             # env loading + validation
    db/                 # libSQL client, transaction helper, migration runner
    middleware/         # requestId, auth, permissions, errors, rate limit
    lib/                # errors, time utilities
    modules/
      auth/
      users/
      consultants/
      services/
      availability/
      bookings/
      admin/
  migrations/
  tests/
  docs/
    learning-plan.md    # this file
    limitations.md      # free-tier limits, what production needs
    interview/
      answers.md        # my own answers to sections 11 and 12
      stories.md        # STAR stories from building SlotBook
    notes/              # one short note per milestone, in my words
  .env.example
  README.md             # setup and run instructions (stays at the root)
```

Each module typically has `routes.ts`, `service.ts` (business rules),
`repository.ts` (SQL) and `schemas.ts` (zod) — but layers are added only
when they make the code clearer.

---

## 10. Milestones

Each milestone ends with: working code, tests where relevant, a short
note in my own words in `docs/notes/`, and the interview questions for that
milestone answered aloud or in writing.

### Milestone 0 — Setup and fundamentals
- Check Node, npm, Git versions; create the GitHub repo
- `npm init`, TypeScript config, `tsx`, ESLint/Prettier
- `.gitignore`, `.env.example`
- **Learn:** what npm scripts do, `dependencies` vs `devDependencies`,
  CommonJS vs ES modules

### Milestone 1 — Express and HTTP
- `app.ts` vs `server.ts`; `GET /health`
- Middleware order, `req`/`res`/`next`, JSON body parsing
- 404 handler and central error middleware
- Request ID middleware, `pino-http` logging
- **Learn:** HTTP methods, status codes, headers, idempotency, the event
  loop, why blocking code hurts every request

### Milestone 2 — Turso and SQL
- Install the Turso CLI; understand the database URL vs the auth token
  (the token is a password), token scopes (read-only vs read-write) and
  expiry
- Connect with `@libsql/client` using `TURSO_DATABASE_URL` and
  `TURSO_AUTH_TOKEN` from `.env`; validate config at startup with zod
- Write a tiny migration runner: apply `migrations/*.sql` in order,
  record each in `schema_migrations`, never re-run an applied file
- First migration; practise SQL manually with `turso db shell slotbook`
- Check what Turso supports: `PRAGMA foreign_keys;`, a test trigger,
  a `STRICT` table, `RETURNING`
- Create a second database `slotbook-test` for remote tests; use a local
  `file:` database for everyday tests
- `GET /ready` checks the database
- **Learn:** how a networked SQLite works, SQLite's type affinity vs
  `STRICT`, parameterised queries, SQL injection, PK/FK/unique/check
  constraints, storing time as epoch milliseconds, quotas and row reads

### Milestone 3 — First resource: consultants and services
- Schema + migration; CRUD for services owned by a consultant (seeded
  user for now)
- zod validation, consistent errors
- Pagination, filtering, sorting with an allow-list
- Integration tests with Vitest + Supertest against a fresh local
  SQLite file per test run (migrations applied at setup)
- **Learn:** offset vs cursor pagination, N+1 queries, joins,
  `EXPLAIN QUERY PLAN`, indexes

### Milestone 4 — Authentication
- Register/login/logout/me; Argon2id
- Sessions in Turso, cookie flags
- Generic login errors, login rate limit (in-memory first)
- **Learn:** hashing vs encryption, salts, sessions vs JWT, cookies,
  CSRF, XSS, user enumeration

### Milestone 5 — RBAC and ownership
- `user_roles`, `requireAuth`, `requirePermission`
- Consultant application + admin approval flow
- Ownership in SQL; 401/403/404 rules
- Full RBAC test suite (section 6.6)
- Suspended users
- **Learn:** authentication vs authorization, RBAC vs ABAC, least
  privilege, IDOR (insecure direct object reference)

### Milestone 6 — Availability
- Weekly rules and exceptions
- Slot generation in the consultant's time zone
- Tests: boundaries, breaks, blocked ranges, buffers, minimum notice,
  invalid dates, DST transitions
- Time-zone conversion with `luxon` (SQLite has no time-zone support)
- **Learn:** UTC vs local time, epoch milliseconds, IANA zones,
  half-open intervals, why the server owns time calculations

### Milestone 7 — Bookings and concurrency
- Booking states and transitions; cancellation policy
- Write the naive version and a concurrent test that **breaks** it
- Add the overlap triggers (section 5.6) and a partial index; map the
  trigger error to `409 SLOT_UNAVAILABLE`
- Transactions with a reusable helper around
  `client.transaction('write')` (commit on success, rollback on error,
  always close the transaction); `client.batch([...], 'write')` for
  simple multi-statement writes
- Snapshots of service data
- **Learn:** ACID, SQLite's single-writer model, `BEGIN DEFERRED` vs
  `IMMEDIATE`, busy errors, race conditions, isolation levels (and how
  Postgres/MySQL differ), optimistic vs pessimistic locking, deadlocks,
  idempotency keys

### Milestone 8 — Redis (Upstash)
- Move the login/booking rate limiter to a Redis store
- Cache public availability responses with a short TTL; invalidate on
  booking/cancel/rule change
- Test: flush Redis → double booking is still rejected by Turso
- Optional: session store in Redis and compare with Turso sessions
- Track command usage against the 500K/month free limit
- **Learn:** cache-aside, TTL, invalidation, stampede, eventual
  consistency, why the cache is not the source of truth, Redis data types

### Milestone 9 — Database comparison labs (Postgres + MySQL)
- Recreate `users`, `services` and a simplified `bookings` table on
  Neon Postgres and on Aiven MySQL (or TiDB)
- Enforce "no overlapping bookings" in each:
  - Postgres: `tstzrange` + exclusion constraint with `btree_gist`
  - MySQL: `SELECT ... FOR UPDATE` on the consultant row in a
    transaction, then check and insert
- Run the same concurrency test against each and record the results
- Compare types (dates/times, booleans, JSON), auto-increment vs UUID,
  `RETURNING` support, isolation levels and locking
- **Learn:** when to pick SQLite/Turso, Postgres or MySQL; SQL dialect
  differences; single-writer vs row-level locking; connection pooling
  (Postgres needs it, `@libsql/client` over HTTP mostly does not)

### Milestone 10 — Production-minded quality
- Config validation, safe error responses, no stack traces to clients
- `helmet`, CORS allow-list, body size limits
- Graceful shutdown: stop accepting, finish requests, close the libSQL
  client and Redis
- OpenAPI docs
- GitHub Actions: install, lint, type-check, test (tests use a local
  SQLite file, so CI needs no database secrets)
- Security review against OWASP API Top 10
- Stretch: outbox pattern + worker, audit log, holds, idempotency keys
- **Learn:** unit vs integration vs e2e tests, mocking, test
  isolation, observability (logs, metrics, traces)

### Milestone 11 — Docker (last skill before cloud)
- Write a `Dockerfile` for the API (multi-stage, non-root user,
  `.dockerignore`)
- Run it locally with env vars pointing at Turso/Upstash
- `docker compose` with the API and a local Redis, and a volume holding
  a local SQLite file, to show the fully offline alternative (and why
  data in a container disappears without a volume)
- **Learn:** image vs container vs volume, layers and caching, ports,
  networks, why containers make "works on my machine" reproducible

### Milestone 12 — Free cloud deployment
- Deploy the API to Render (Docker or native Node build)
- Env vars on Render: Turso URL and a production token (separate from
  the dev token), Upstash credentials
- Run migrations as a deliberate step, not on every boot by accident
- HTTPS URL, health check path configured
- Decide the cross-origin strategy (section 6.8), set `CORS_ORIGINS`
  and cookie flags for the deployed frontend URL
- Read logs to debug one deliberate failure
- Write `docs/limitations.md`: free-tier sleep/cold starts, quotas,
  single region, only Turso's 1-day restore window (plus manual exports),
  what production would need
- **Learn:** environments, twelve-factor config, TLS termination,
  reverse proxies, cold starts, stateless servers, horizontal vs
  vertical scaling, managed vs self-hosted DB, rollbacks, regions,
  backups

### Milestone 13 — Plain frontend (separate repo `slotbook-web`)
- New repository with plain HTML, CSS and JS; no build step needed
- Pages: login/register, consultants list, consultant page with slots,
  booking confirmation, my bookings with cancel, consultant calendar,
  admin approvals
- API base URL in one config place; `fetch` with
  `credentials: 'include'`; show API error messages and request IDs
- Run locally against the local API, then deploy to a free static host
  with the `/api` proxy from section 6.8
- **Learn:** origins vs sites, CORS preflight, `SameSite` cookies,
  third-party cookie blocking, why hiding a button is not authorization

---

## 11. Interview preparation (1-year backend)

How to use this section:

1. Cover the answer, say your own answer out loud, then compare.
2. Do not memorise the wording. Interviewers follow up, and a memorised
   answer falls apart on the second question.
3. Wherever an answer mentions SlotBook, point to the real file, test or
   migration once it exists.
4. The model answers are short on purpose. A good spoken answer is about
   30–90 seconds: definition, why it matters, an example.

### 11.1 JavaScript / TypeScript / Node.js

**Q: What is the Node.js event loop?**
A: Node runs your JavaScript on one main thread. Slow work like network
and file I/O is handed to the operating system or libuv's thread pool,
and when it finishes, its callback is queued. The event loop repeatedly
picks queued callbacks and runs them. The main phases are: timers
(`setTimeout`/`setInterval`), pending callbacks, poll (most I/O
callbacks), check (`setImmediate`), and close callbacks. This is why one
Node process can serve many concurrent requests: it never sits waiting
on I/O, it moves on to the next callback.

**Q: Microtasks vs macrotasks? Where does `process.nextTick` fit?**
A: Macrotasks are the callbacks the event loop phases run (timers, I/O,
`setImmediate`). Microtasks are promise callbacks (`.then`, code after
`await`) and `queueMicrotask`. After each callback, Node empties the
`process.nextTick` queue first, then the promise microtask queue, before
continuing. So `nextTick` runs before promise callbacks, and both run
before the next timer. Too many recursive `nextTick` calls can starve
I/O.

**Q: What blocks the event loop and why is it bad?**
A: Any long synchronous work on the main thread: a big `JSON.parse`, a
heavy loop, synchronous crypto or file calls (`fs.readFileSync` inside a
request), a catastrophic regex. While it runs, no other request is
processed, so every user waits. Fixes: use async APIs, split the work,
or move CPU-heavy work to worker threads. In SlotBook, `argon2` hashing
runs on libuv's thread pool (async API), so logins do not freeze other
requests.

**Q: When would you use worker threads?**
A: For CPU-bound work in the same process, such as image processing,
heavy calculation or compression of large data. They run JavaScript in
parallel on other threads with their own event loops and communicate by
messages. They do not help with I/O, which is already non-blocking.

**Q: Callbacks vs promises vs async/await — and error handling in each?**
A: Callbacks pass `(err, result)` and lead to deep nesting; you must
check `err` every time. Promises represent a future value and chain with
`.then` and `.catch`. `async/await` is syntax over promises that reads
like synchronous code; errors are handled with `try/catch`. A
forgotten `await` or a promise without `.catch` causes an unhandled
rejection, which by default crashes Node — which is good, because
silent failures are worse.

**Q: `Promise.all` vs `allSettled` vs `race` vs `any`?**
A: `all` waits for all and rejects as soon as one rejects. `allSettled`
waits for all and returns each result or error, never rejects.
`race` settles with the first one that settles (success or failure).
`any` resolves with the first success and rejects only if all fail.
SlotBook's concurrency test uses `Promise.all` (or `allSettled`) to fire
many booking requests at the same time.

**Q: What are streams and backpressure?**
A: Streams process data in chunks instead of loading it all into
memory, e.g. reading a large file or sending a CSV export. Backpressure
is when the consumer is slower than the producer: `write()` returns
`false`, and you should wait for the `drain` event before writing more.
`stream.pipeline()` handles this and error cleanup for you.

**Q: CommonJS vs ES modules?**
A: CommonJS uses `require` and `module.exports`, loads synchronously and
is Node's original system. ES modules use `import`/`export`, are the
JavaScript standard, are statically analysable, and support top-level
`await`. Node decides by file extension (`.mjs`/`.cjs`) or the
`"type"` field in `package.json`. Mixing them causes most "cannot use
import statement" errors.

**Q: `interface` vs `type` in TypeScript?**
A: Both describe object shapes. `interface` can be extended and merged
(declaration merging) and is the usual choice for object contracts.
`type` can also express unions, intersections, tuples and mapped types
(`type Status = 'confirmed' | 'completed'`). In practice: unions and
utility types use `type`; either works for plain objects — pick one
convention.

**Q: `any` vs `unknown`? What is narrowing?**
A: `any` turns off type checking. `unknown` means "could be anything,
but you must check before using it". Narrowing is using checks
(`typeof`, `instanceof`, `in`, discriminant fields, zod parsing) so
TypeScript knows the specific type inside a branch. Request bodies and
caught errors should be treated as `unknown`.

**Q: What are generics?**
A: Type parameters that let one function or type work with many types
while keeping type safety, e.g. `function first<T>(items: T[]): T`. In
SlotBook, a `Paginated<T>` response type or a `withTransaction<T>`
helper that returns whatever the callback returns.

**Q: If we have TypeScript, why do we still need zod?**
A: TypeScript types are erased at compile time. At runtime, a request
body is just JSON from an untrusted client — it can be anything. zod
validates the actual data at runtime and also produces the TypeScript
type, so the type and the check never drift apart.

### 11.2 Express

**Q: What is middleware in Express?**
A: A function `(req, res, next)` that runs during a request. It can
read or modify `req`/`res`, end the response, or call `next()` to pass
control on. Body parsing, logging, authentication, rate limiting and
error handling are all middleware. A request flows through middleware
in the order they were registered.

**Q: Why does middleware order matter?**
A: Because it runs top to bottom. `express.json()` must come before
routes that read `req.body`; the request-ID middleware must come before
the logger so logs include the ID; `requireAuth` must run before
`requirePermission`; the 404 handler comes after all routes; the error
handler comes last.

**Q: How is error-handling middleware different?**
A: It has four parameters: `(err, req, res, next)`. Express recognises it
by the parameter count and only calls it when an error is passed via
`next(err)` or thrown. It must be registered after the routes. In
SlotBook, it converts known `AppError`s to the JSON error format, maps
database errors (e.g. the overlap trigger's `SLOT_UNAVAILABLE` → `409`), logs unknown errors with the
request ID, and returns a safe `500` without a stack trace.

**Q: What changed for async errors in Express 5?**
A: In Express 4, if an `async` handler threw or a promise rejected, the
error was not passed to the error middleware unless you wrapped the
handler or called `next(err)` yourself; the request could hang. Express 5
catches rejected promises returned from handlers and middleware and
forwards them to `next(err)` automatically. Express 5 also has a newer
route-path syntax, so some old wildcard patterns need updating.

**Q: `app` vs `Router`? How do you structure a larger app?**
A: `app` is the whole application. `express.Router()` is a mini app for a
group of routes with its own middleware, mounted at a path
(`app.use('/api/v1/bookings', bookingsRouter)`). SlotBook groups by
feature module (auth, consultants, availability, bookings, admin), each
with routes, validation schemas, business logic and SQL, instead of one
giant routes file.

**Q: Why separate `app.ts` from `server.ts`?**
A: `app.ts` builds and returns the configured Express app without
listening on a port. `server.ts` creates the server, listens, and handles
shutdown signals. Tests import the app and use Supertest to send
requests in memory — no port, no conflicts, faster tests. It also keeps
startup concerns (ports, signals) out of the application logic.

**Q: How do you handle a request that is too large or malformed JSON?**
A: Set a body size limit (`express.json({ limit: '100kb' })`) so large
bodies are rejected with `413`. Malformed JSON makes the parser raise an
error, which the error middleware should turn into a `400` with a clear
message, not a `500`.

### 11.3 HTTP and REST

**Q: Explain the common status codes.**
A:
- `200 OK` — success with a body
- `201 Created` — a resource was created (`POST /bookings`), often with
  a `Location` header
- `204 No Content` — success, no body (e.g. logout)
- `400 Bad Request` — malformed request or failed validation
- `401 Unauthorized` — not authenticated (missing/invalid session)
- `403 Forbidden` — authenticated but not allowed
- `404 Not Found` — resource does not exist (or you may not know it
  exists)
- `409 Conflict` — conflicts with current state (slot taken, invalid
  status transition)
- `422 Unprocessable Content` — syntactically fine but semantically
  invalid (some teams use this instead of 400 for validation)
- `429 Too Many Requests` — rate limited, ideally with `Retry-After`
- `500 Internal Server Error` — unexpected bug
- `503 Service Unavailable` — temporarily cannot serve (e.g. readiness
  fails because the database is down)

**Q: What are safe and idempotent methods?**
A: Safe methods do not change server state: `GET`, `HEAD`, `OPTIONS`.
Idempotent means sending the same request many times has the same
effect as once: `GET`, `PUT`, `DELETE` are idempotent; `POST` is not.
That is why retrying a `POST /bookings` after a timeout is dangerous
without an idempotency key.

**Q: PUT vs PATCH?**
A: `PUT` replaces the whole resource with what you send and is
idempotent. `PATCH` applies a partial update. SlotBook uses
`PUT /me/availability-rules` to replace the whole weekly schedule at
once, and `PATCH` for editing a few fields of a service or profile.

**Q: What makes a good REST API design?**
A: Nouns for resources (`/bookings`), HTTP methods for actions, plural
collections, nested paths only when the relationship is real, consistent
error format, versioning (`/api/v1`), pagination on lists, filtering via
query parameters, and correct status codes. Actions that are not plain
CRUD (cancel) can be modelled as a sub-resource like
`POST /bookings/:id/cancel`, which is clearer than `PATCH status`.

**Q: Offset vs cursor pagination?**
A: Offset (`LIMIT 20 OFFSET 40`) is simple and supports "jump to page
3", but gets slower on large offsets and can skip or repeat items when
data changes between pages. Cursor (keyset) pagination uses the last
seen value (`WHERE (start, id) > ($1, $2) ORDER BY start, id LIMIT 20`):
stable and fast with an index, but no random page jumps. SlotBook uses
offset for the small consultant list and can use cursor for bookings.

**Q: How do you version an API?**
A: Most commonly in the URL (`/api/v1`), sometimes in a header. A new
version is needed only for breaking changes (removing fields, changing
meaning). Adding optional fields is not breaking.

**Q: Explain `Content-Type`, `Authorization`, `Cache-Control` and
`ETag`.**
A: `Content-Type` says the format of the body (`application/json`).
`Authorization` carries credentials such as `Bearer <token>`.
`Cache-Control` tells browsers and proxies whether and how long to
cache (`no-store` for private data like bookings). `ETag` is a version
identifier of a response; the client sends it back in `If-None-Match`
and the server replies `304 Not Modified` if nothing changed, saving
bandwidth.

**Q: What happens when you type a URL into the browser?**
A: The browser resolves the domain to an IP via DNS, opens a TCP
connection (or QUIC for HTTP/3), performs a TLS handshake to set up
encryption and verify the certificate, sends the HTTP request with
headers and cookies, the server (often behind a load balancer/reverse
proxy) processes it and responds, and the browser parses the HTML,
fetches CSS/JS/images and renders the page.

**Q: REST vs GraphQL vs gRPC?**
A: REST: resources over HTTP, simple, cacheable, the default for public
APIs. GraphQL: one endpoint where the client asks for exactly the fields
it needs; good for complex frontends, harder to cache and secure
(query cost). gRPC: binary Protocol Buffers over HTTP/2, fast and
strongly typed, mostly for service-to-service communication.

**Q: What is CORS?**
A: A browser rule. By default, JavaScript on one origin (scheme +
domain + port) cannot read responses from another origin. The server
opts in with headers like `Access-Control-Allow-Origin`. For non-simple
requests, the browser first sends an `OPTIONS` preflight. CORS is not a
security barrier against attackers — curl and scripts ignore it.
Authentication and authorization still protect the API.

### 11.4 Databases and SQL

**Q: Inner join vs left join?**
A: An inner join returns only rows that match in both tables. A left
join returns all rows from the left table, with `NULL`s where there is
no match. Example: listing all consultants with their booking count
needs a `LEFT JOIN bookings` so consultants with zero bookings still
appear.

**Q: `WHERE` vs `HAVING`?**
A: `WHERE` filters rows before grouping; `HAVING` filters groups after
aggregation. "Consultants with more than 10 confirmed bookings":
`WHERE status = 'confirmed' GROUP BY consultant_id HAVING count(*) > 10`.

**Q: What is a CTE and a window function?**
A: A CTE (`WITH x AS (...)`) is a named subquery that makes a complex
query readable. A window function computes across related rows without
collapsing them, e.g. `ROW_NUMBER() OVER (PARTITION BY customer_id
ORDER BY start)` to find each customer's next booking.

**Q: What is normalisation? When do you denormalise?**
A: Normalisation organises data so each fact is stored once, avoiding
update anomalies: 1NF (atomic values, no repeating groups), 2NF (no
partial dependency on part of a composite key), 3NF (no dependency on
non-key columns). You denormalise deliberately for history or
performance. SlotBook copies the service name, duration and price into
each booking because a booking must show what was booked at that time,
even if the service changes later — that is a business requirement,
not duplication by accident.

**Q: What is an index and how does it work?**
A: A separate data structure (usually a B-tree) that keeps column values
sorted with pointers to rows, so the database can find rows without
scanning the whole table. It speeds up `WHERE`, `JOIN`, `ORDER BY`, and
uniqueness checks.

**Q: Why does column order in a composite index matter?**
A: A B-tree index on `(consultant_id, start_at)` is sorted by
`consultant_id` first, then `start_at`. It helps queries filtering on
`consultant_id`, or `consultant_id` plus a range on `start_at`, but not
queries filtering only on `start_at` (the leftmost-prefix rule). Put
equality columns first, range/sort columns after.

**Q: When do indexes hurt?**
A: Every insert/update/delete must update every index, so writes get
slower and storage grows. Indexes on rarely-queried or low-selectivity
columns (like a boolean) often are not used. Add indexes from real query
patterns and confirm with the query plan.

**Q: How do you check whether a query uses an index?**
A: Ask the database for its plan. In SQLite/Turso,
`EXPLAIN QUERY PLAN SELECT ...` shows `SCAN bookings` (reads the whole
table — bad on big tables) or `SEARCH bookings USING INDEX ...` (uses an
index). On Turso this matters twice: a scan is slower **and** every
scanned row counts against the monthly read quota. In Postgres,
`EXPLAIN ANALYZE` shows `Seq Scan` vs `Index Scan` with real timings and
estimated vs actual rows; it really executes the query, so be careful
with writes.

**Q: Database constraints or application validation — which?**
A: Both. Application validation (zod, business rules) gives friendly
error messages early. Database constraints (`NOT NULL`, `UNIQUE`,
`CHECK`, foreign keys, triggers) are the last line of defence and hold
even with bugs, concurrent requests, scripts or a second service. Critical
invariants like "no overlapping bookings" must live in the database.

**Q: What are migrations? How do you change a schema without
downtime?**
A: Migrations are versioned, ordered schema change files kept in Git and
applied the same way in every environment, with a table recording which
ran. For zero downtime use expand/contract: add the new column or table
(compatible with old code), deploy code that writes both, backfill,
switch reads, then remove the old column in a later migration. Avoid
long locks on large tables (Postgres can create indexes
`CONCURRENTLY`). SQLite's `ALTER TABLE` is limited — some changes need
"create new table, copy data, drop old, rename" inside a transaction,
which SlotBook's migrations handle as plain SQL files.

**Q: What is SQL injection and how do you prevent it?**
A: When untrusted input is concatenated into SQL, an attacker can change
the query (`' OR 1=1 --`). Prevent it with parameterised queries
(`WHERE id = ?` with values passed separately in `args`), so input is always
treated as data. For dynamic parts that cannot be parameters (like
`ORDER BY` column), use an allow-list.

**Q: What is connection pooling? Does SlotBook need it?**
A: With servers like Postgres and MySQL, opening a connection is
expensive and each one uses server memory, so the server supports a
limited number. A pool keeps a few connections open and lends them to
requests (`pg.Pool` in Node; PgBouncer on the server side for many app
instances or serverless functions). SlotBook uses Turso through
`@libsql/client`, which sends queries over HTTP/WebSockets to Turso's
servers, so the app creates **one client at startup and reuses it**
instead of managing a pool. Creating a new client per request would
still be wasteful. In the Milestone 9 Postgres lab I use a real pool.

**Q: SQL vs NoSQL?**
A: SQL databases have schemas, relations, joins and strong transactions
— ideal when data is relational and correctness matters (bookings,
money). NoSQL covers many types (document, key-value, wide-column,
graph) with flexible schemas and easier horizontal scaling for specific
access patterns. The choice depends on data shape and consistency
needs, not hype.

**Q: SQLite/Turso vs Postgres vs MySQL?**
A: SQLite: a database in a single file, embedded in the app, no server;
very fast reads, one writer at a time, flexible typing unless `STRICT`.
Turso hosts libSQL (a SQLite fork) as a network database with
replication and a free tier — what SlotBook uses. Postgres: a server
with rich types (ranges, JSONB, arrays), exclusion constraints, row-level
locking and many concurrent writers — best for complex correctness rules
at scale. MySQL: very widely used, simple, fast for common web
workloads, strong replication ecosystem, fewer advanced types. I chose
Turso for a free, simple, serverless-friendly start; I would move to
Postgres if write concurrency or advanced constraints became the
bottleneck.

**Q: Soft delete vs hard delete?**
A: Hard delete removes the row. Soft delete marks it (`archived_at` or
`is_active = false`) and hides it in queries. SlotBook archives services
instead of deleting them because past bookings reference them, and
history must stay valid. Downsides: every query must filter archived
rows, and unique constraints may need to be partial.

**Q: UUID vs auto-increment IDs?**
A: Auto-increment integers are small, fast and ordered, but guessable
and expose counts. UUIDs are globally unique and safe to expose, but
larger; random UUIDv4 fragments indexes, so time-ordered UUIDv7 is a
good middle ground. Either way, guessable or not, authorization checks
are still required.

### 11.5 Transactions and concurrency

**Q: What is a transaction? Explain ACID with an example.**
A: A transaction groups statements into one all-or-nothing unit. In
SlotBook, creating a booking might insert the booking and an outbox
event together.
- Atomicity: both are written or neither.
- Consistency: constraints hold before and after (no overlap, valid
  status).
- Isolation: concurrent transactions do not see each other's partial
  work.
- Durability: once committed, it survives a crash.

**Q: Explain isolation levels and the anomalies they prevent.**
A:
- Dirty read: reading another transaction's uncommitted data.
- Non-repeatable read: reading the same row twice and getting different
  values because someone committed in between.
- Phantom read: re-running a query and getting new rows.
- Lost update: two transactions read, modify, and write the same value;
  one overwrites the other.

Levels: Read Uncommitted, Read Committed, Repeatable Read, Serializable.
SQLite/Turso transactions are serializable: writers take one database-wide
write lock, and readers see a consistent snapshot. Postgres's default is
Read Committed (each statement sees data committed before it started);
its Repeatable Read is snapshot isolation; its Serializable may abort a
transaction with `40001`, which the app must retry. MySQL InnoDB's
default is Repeatable Read.

**Q: Why does "check availability, then insert booking" fail?**
A: Two requests run at the same time. Both run the `SELECT` for
overlapping bookings, both see none (neither has inserted yet), and both
insert. If the check and insert are separate statements (autocommit),
nothing stops this on any database. In Postgres it still fails inside a
Read Committed or Repeatable Read transaction, because they insert
different rows (a "write skew"). Tests that run one request at a time
never catch it.

**Q: How does SlotBook prevent double booking?**
A: In the database. A `BEFORE INSERT` trigger on `bookings` checks for
another `confirmed` booking for the same consultant where
`existing.start_at < new.block_end_at AND new.start_at <
existing.block_end_at`, and runs `RAISE(ABORT, 'SLOT_UNAVAILABLE')` if
one exists. A matching `BEFORE UPDATE` trigger covers status or time
changes. It is safe under concurrency because Turso/SQLite runs one
write at a time: the trigger's check and the insert happen together
under the write lock, so the second of two competing inserts sees the
first and aborts. The API maps that error to `409 SLOT_UNAVAILABLE`. A
partial index on `(consultant_id, start_at) WHERE status = 'confirmed'`
keeps the check fast. (Postgres would use an exclusion constraint on a
`tstzrange` instead — I tried that in the comparison lab.)

**Q: What is `BEGIN IMMEDIATE` and why does it matter in SQLite?**
A: A normal (`DEFERRED`) SQLite transaction starts as a reader and only
takes the write lock at its first write. If two such transactions read
and then both try to write, one fails with a busy error. `BEGIN
IMMEDIATE` takes the write lock at the start, so a "read, decide,
write" transaction runs without being interrupted, and others wait
their turn. `client.transaction('write')` in `@libsql/client` starts
this kind of transaction. Keep these transactions short, because they
block every other writer.

**Q: What is `SELECT ... FOR UPDATE`?**
A: In Postgres and MySQL, it locks the selected rows until the
transaction ends; other transactions that try to lock or update those
rows wait. To prevent double booking there, you lock the consultant's
row (`SELECT ... FROM consultant_profiles WHERE user_id = $1 FOR
UPDATE`), then check overlaps, then insert. It works, but every booking
path must remember to take the lock. SQLite has no row locks — it locks
the whole database for writes — so SlotBook does not need it.

**Q: Optimistic vs pessimistic locking?**
A: Pessimistic: lock first (`FOR UPDATE`), others wait — good when
conflicts are common. Optimistic: no lock; keep a `version` column and
update with `WHERE id = $1 AND version = $2`; if zero rows changed,
someone else updated it first, so return `409` or retry — good when
conflicts are rare (editing a profile).

**Q: What is a deadlock and how do you avoid it?**
A: Transaction A locks row 1 and waits for row 2, while transaction B
locks row 2 and waits for row 1. Neither can continue. Postgres and
MySQL detect it and abort one (Postgres error `40P01`). SQLite cannot
deadlock on rows because it has a single write lock, but it has the
similar busy problem: a writer waits for the lock and fails with a busy
error after a timeout. Avoid both with a consistent lock order, short
transactions, no user waiting or network calls inside a transaction,
and safe retries.

**Q: What is an idempotency key?**
A: A unique key the client sends with a non-idempotent request
(`Idempotency-Key` header). The server stores the key with the user and
the result; if the same request arrives again (a retry after a timeout),
it returns the stored result instead of creating a second booking. A
unique constraint on `(user_id, key)` makes this safe under concurrency.

**Q: What should never happen inside a database transaction?**
A: Slow external calls (HTTP requests, sending email, payment calls),
waiting for user input, or long computations. They hold locks and
connections open. Do them before or after, or use the outbox pattern.

### 11.6 Authentication, authorization and security

**Q: Authentication vs authorization?**
A: Authentication answers "who are you?" (login, verifying a session or
token). Authorization answers "what are you allowed to do?" (roles,
permissions, ownership). Failing authentication → `401`; failing
authorization → `403` (or `404` to hide another user's resource).

**Q: Sessions vs JWT?**
A: Sessions: the server stores session data (in the database — Turso in
SlotBook — or Redis) and
gives the browser a random session ID in an HTTP-only cookie. Easy to
revoke (delete the row), small cookie, but needs a lookup per request.
JWT: a signed token containing claims; the server verifies the signature
without a lookup, which suits multiple services, but you cannot revoke
it before it expires without extra machinery (short expiry + refresh
tokens, or a denylist). For a single web API like SlotBook, sessions are
simpler and safer.

**Q: Where should a browser store tokens?**
A: Preferably in an `HttpOnly`, `Secure`, `SameSite` cookie, which
JavaScript cannot read, so XSS cannot steal it. `localStorage` is
readable by any script on the page, so an XSS bug leaks the token.
Cookies bring CSRF risk, which is handled with `SameSite` and origin
checks or CSRF tokens.

**Q: What is refresh token rotation?**
A: A short-lived access token (minutes) plus a long-lived refresh token.
Each time the refresh token is used, the server issues a new one and
invalidates the old one. If an old refresh token is used again, it was
probably stolen, so the server revokes the whole token family.

**Q: How should passwords be stored?**
A: Never plain text or with encryption you can reverse. Use a slow,
salted password hashing algorithm: Argon2id (current recommendation),
bcrypt or scrypt. The salt (random per user) prevents precomputed
rainbow tables and makes identical passwords hash differently. On login,
hash the attempt and compare.

**Q: Why not just SHA-256 the password?**
A: SHA-256 is designed to be fast. A GPU can try billions of guesses per
second against a leaked database. Password hashes are deliberately slow
and memory-hard (Argon2id) so each guess is expensive.

**Q: What is user enumeration?**
A: When an attacker can tell whether an account exists, e.g. "email not
found" vs "wrong password", or different response times. SlotBook
returns the same "invalid email or password" message for both, and
rate-limits login.

**Q: RBAC vs ABAC?**
A: RBAC (role-based): permissions are attached to roles (customer,
consultant, admin), users get roles. Simple and auditable. ABAC
(attribute-based): decisions use attributes of the user, resource and
context ("a consultant can cancel a booking if they own it and it is in
the future"). Real apps usually combine RBAC with ownership/attribute
checks, as SlotBook does.

**Q: What is IDOR / Broken Object Level Authorization?**
A: Insecure Direct Object Reference: the API trusts the ID in the URL
without checking that the user may access it. Changing
`/bookings/123` to `/bookings/124` shows someone else's booking. It is
#1 in the OWASP API Top 10. Fix: every query for a user-owned resource
includes the owner, e.g. `WHERE id = $1 AND customer_id = $2`.

**Q: What is CSRF and how do you prevent it?**
A: Cross-Site Request Forgery: a malicious site makes the user's browser
send a request to your site, and the browser attaches the user's cookies
automatically. Defences: `SameSite=Lax` or `Strict` cookies (not sent on
cross-site POSTs), checking the `Origin` header on state-changing
requests, CSRF tokens, and never changing state with `GET`.

**Q: What is XSS?**
A: Cross-Site Scripting: an attacker gets their script to run on your
page (e.g. a bio containing `<script>`), which can steal data or act as
the user. Defences: escape output (use `textContent`, not `innerHTML`,
in the plain JS frontend), a Content Security Policy (helmet), and
`HttpOnly` cookies so scripts cannot read the session.

**Q: Name the main OWASP API Security Top 10 risks.**
A: (2023 list) Broken Object Level Authorization; Broken
Authentication; Broken Object Property Level Authorization (mass
assignment and returning too many fields); Unrestricted Resource
Consumption (no rate or size limits); Broken Function Level
Authorization (customer calling admin endpoints); Unrestricted Access to
Sensitive Business Flows (bots grabbing all slots); Server-Side Request
Forgery; Security Misconfiguration; Improper Inventory Management (old
undocumented endpoints); Unsafe Consumption of third-party APIs.

**Q: What is mass assignment?**
A: Copying the request body directly into the database, so a user can
send fields they should not control, like `"role": "admin"` or
`"status": "completed"`. Prevent it by validating with a zod schema that
only allows specific fields, and by never passing `req.body` straight
into SQL.

**Q: How do you manage secrets?**
A: Keep them in environment variables or a secrets manager, never in
Git. Commit `.env.example` with placeholder names only. Use different
secrets per environment, give each credential the least privilege it
needs, and rotate anything that leaks. In CI, use GitHub Secrets; on
Render, use its environment variables.

**Q: Why rate limit, and where?**
A: To slow brute-force password guessing, protect expensive endpoints
and stop abuse (one bot booking every slot). In SlotBook: login,
registration and booking creation, keyed by IP and/or user, returning
`429` with `Retry-After`.

### 11.7 Redis and caching

**Q: What is Redis and what is it used for?**
A: An in-memory key-value data store with data structures (strings,
hashes, lists, sets, sorted sets, streams) and expiry on keys. Common
uses: caching, rate limiting, sessions, queues, pub/sub, leaderboards,
distributed locks. It is very fast because data lives in memory.

**Q: Cache-aside vs write-through?**
A: Cache-aside (lazy loading): read from cache; on a miss, read the
database, store it in cache with a TTL. The app controls everything;
SlotBook uses this for availability. Write-through: every write updates
the database and the cache together, so reads are always warm, but
writes are slower and you cache data nobody reads.

**Q: How do you invalidate a cache?**
A: Two tools: TTL (data expires after N seconds; simple, briefly stale)
and explicit deletion when the source data changes. SlotBook deletes the
availability cache keys for a consultant when a booking is created or
cancelled or availability rules change, and also sets a short TTL as a
safety net.

**Q: What is a cache stampede?**
A: When a popular key expires and many requests miss at once and all hit
the database. Fixes: a lock so only one request rebuilds the value
(single-flight), adding random jitter to TTLs, or serving the stale
value while refreshing in the background.

**Q: Rate limiting algorithms?**
A: Fixed window: count requests per minute with `INCR` + `EXPIRE`;
simple but allows bursts at window edges. Sliding window: smoother,
counts requests in the last N seconds (sorted sets or weighted
windows). Token bucket: tokens refill at a steady rate, each request
spends one; allows controlled bursts.

**Q: Why does a rate limiter need Redis when you run several
servers?**
A: An in-memory limiter counts per process. With three app instances, a
user gets three times the limit, and a restart resets counters. A shared
store like Redis gives all instances one counter.

**Q: Why can't Redis decide if a booking is valid?**
A: A cache can be stale, evicted or flushed, and Redis writes are not
part of the database transaction. If Redis said "free" while Turso
already had a booking, we would double-book. Turso, with its overlap
trigger, is the source of truth; Redis only speeds up reads and protects
endpoints.

**Q: What happens if Redis goes down?**
A: The app must keep working, possibly slower. The availability cache
falls back to reading Turso. For the rate limiter, decide and
document: fail open (allow requests, log a warning) or fall back to an
in-memory limiter. Bookings are unaffected because their correctness
lives in Turso.

### 11.8 Testing and debugging

**Q: Unit vs integration vs end-to-end tests?**
A: Unit tests check one function in isolation, fast (e.g. slot generation
from rules, cancellation-window logic). Integration tests check pieces
working together, like an HTTP request through Express to a real
database. End-to-end tests drive the whole system like a user would.
The test pyramid: many unit tests, fewer integration, very few E2E.

**Q: When do you mock and when do you use the real dependency?**
A: Mock things that are slow, external or non-deterministic (email
provider, payment API, the current time). Use the real database for
repository and API tests, because SQL, constraints and transactions are
exactly what mocks would hide. SlotBook's tests run against a real
SQLite database: a fresh local file (`file:` URL) with migrations
applied, using the same `@libsql/client` and SQL as production. A few
tests (like the concurrency test) also run against a separate
`slotbook-test` Turso database.

**Q: How do you keep tests isolated?**
A: Each test starts from known data: truncate tables or reset seed data
between tests, use unique data per test, never depend on test order,
and never point tests at a real or production database. Freeze or inject
the clock for time-based rules.

**Q: How do you test time-dependent logic?**
A: Pass the current time in (or use Vitest fake timers) instead of
calling `new Date()` deep inside business logic. Then tests can say
"now is 23 hours before the booking" and assert cancellation is refused.

**Q: How do you debug a `500` in production?**
A: Get the request ID from the error response or the user, search the
logs for it, read the logged error and stack trace and the inputs around
it, reproduce locally with the same input, write a failing test, fix
it, and deploy. Structured JSON logs with request IDs make this fast.

### 11.9 Docker and cloud

**Q: Image vs container?**
A: An image is a read-only template: your app code, dependencies and a
base OS layer, built from a Dockerfile. A container is a running
instance of an image, with its own process, filesystem layer and
network. One image can run as many containers.

**Q: What are Dockerfile layers and why does order matter?**
A: Each instruction creates a cached layer. If a layer changes, all
layers after it are rebuilt. Copy `package.json` and `package-lock.json`
and run `npm ci` before copying source code, so dependencies are cached
and code changes rebuild only the last layers.

**Q: What is a multi-stage build?**
A: Several `FROM` stages in one Dockerfile. A build stage has dev
dependencies and compiles TypeScript; the final stage copies only the
compiled JavaScript and production dependencies onto a small base
image. Result: a smaller, safer image. Also run as a non-root user and
use `.dockerignore` to exclude `node_modules`, `.env` and `.git`.

**Q: Volumes and networks?**
A: Containers are disposable; data written inside is lost when the
container is removed. Volumes store data outside the container (for
example the local SQLite file in SlotBook's offline Compose setup).
Docker networks let containers reach each other by service name
(`redis:6379`) in Compose.

**Q: What is Docker Compose?**
A: A YAML file describing several services (API, Redis, a database), their
environment, ports, volumes and dependencies, started together with
`docker compose up`. SlotBook uses it at the end to run an offline local
stack.

**Q: What is a twelve-factor app?**
A: Guidelines for cloud-ready apps. The main ones for SlotBook: config
in environment variables, stateless processes (sessions in a shared
store, not memory), backing services (DB, Redis) attached via URLs, logs
written to stdout as a stream, the same build promoted across
environments, fast startup and graceful shutdown, and dev/prod parity.

**Q: Vertical vs horizontal scaling?**
A: Vertical: a bigger machine (more CPU/RAM) — simple but limited and a
single point of failure. Horizontal: more instances behind a load
balancer — scales further and survives one instance failing, but the app
must be stateless and the database becomes the shared bottleneck.

**Q: What does "stateless server" mean?**
A: No user-specific data lives only in one instance's memory. Sessions,
rate-limit counters and caches live in Turso or Redis, so any
instance can handle any request and instances can be added, removed or
restarted freely.

**Q: Managed database vs self-hosting?**
A: Managed (Turso, RDS, Neon, Aiven): the provider handles backups,
patching, failover and monitoring; you pay more and get less control.
Self-hosted (a database in a container or VM): cheaper and full control, but backups,
upgrades, security and recovery are your job. For a small team, managed
is usually the right default.

**Q: Explain backups and restore.**
A: A backup you have never restored is not proven. Know your RPO (how
much data you can afford to lose) and RTO (how long recovery can take).
Turso free gives a 1-day point-in-time restore window, and the database
can be exported as a SQLite file; production needs longer retention,
scheduled exports and regular restore tests.

**Q: What is CI/CD?**
A: Continuous Integration: every push runs automated checks — install,
lint, type-check, tests — so broken code is caught early. Continuous
Delivery/Deployment: passing builds are automatically packaged and
deployed. SlotBook: GitHub Actions for CI, Render auto-deploys from the
main branch.

**Q: Serverless vs containers vs VMs?**
A: VMs: a full virtual machine you manage (OS, patches). Containers:
packaged apps sharing the host kernel, lightweight and portable; a
platform like Render runs them. Serverless functions: you deploy
functions, the provider runs and scales them per request and scales to
zero; no server management, but cold starts, time limits, and
connection pooling challenges.

**Q: What is a cold start?**
A: The delay when something asleep has to start before serving a
request. SlotBook sees it on Render's free web service, which sleeps
after 15 minutes idle (~1 minute wake). Turso's free plan has no cold
starts, but serverless Postgres like Neon does (compute sleeps after 5
idle minutes). Production avoids this with always-on instances.

**Q: Logs vs metrics vs traces?**
A: Logs: detailed records of events ("booking created", errors).
Metrics: numbers over time (requests per second, error rate, latency
p95, DB pool usage) for dashboards and alerts. Traces: the path of one
request across services with timings for each step. Together they are
observability.

**Q: Health check vs readiness check?**
A: Health (liveness): "is the process alive?" — if it fails, restart it.
SlotBook's `/health` does not touch the database. Readiness: "can it
serve traffic now?" — checks the database (and Redis); if it fails,
the load balancer stops sending traffic but does not necessarily
restart it. `/ready` returns `503` when the DB is unreachable.

**Q: What is graceful shutdown?**
A: When the platform sends `SIGTERM` (during deploys), the app stops
accepting new connections, lets in-flight requests finish within a
timeout, closes the database pool and Redis client, then exits. Without
it, deploys cut requests in half.

**Q: What is a CDN and what is TLS termination?**
A: A CDN caches static files (HTML, CSS, JS, images) on servers close to
users, reducing latency and load. TLS termination is where HTTPS is
decrypted: on Render, its proxy terminates TLS and forwards plain HTTP
to the app, so Express needs `app.set('trust proxy', 1)` to see the real
client IP and treat requests as secure for cookies.

**Q: What is a reverse proxy / load balancer?**
A: A server in front of the app that receives client requests and
forwards them: it terminates TLS, spreads load across instances, adds
headers like `X-Forwarded-For`, and can compress, cache or rate-limit.
Nginx, cloud load balancers and Render's router are examples.

### 11.10 System design (1-year level)

**Q: Design an appointment booking system.**
A: Clarify requirements first: roles, time zones, booking rules, scale.
Then: one stateless API (Express) behind a load balancer, a relational
database as source of truth (SlotBook: Turso; at large scale often
Postgres), Redis for rate limiting and caching availability, and a
background worker for emails via an outbox table. Data: users, roles,
consultant profiles, services, availability rules, exceptions, bookings
with start/end instants and a database-enforced no-overlap rule
(SlotBook: trigger under SQLite's single writer; Postgres: exclusion
constraint). Key flows: availability is computed from rules minus
exceptions minus bookings; booking creation re-validates and relies on
the database rule for concurrency. Then discuss time zones, cancellation
policy, security (RBAC, ownership), and scaling. (Use SlotBook as the
worked example.)

**Q: How would you scale availability reads?**
A: First measure. Add the right indexes; cache availability per
consultant/service/date in Redis with a short TTL and invalidate on
changes; add read replicas for read-heavy traffic (accepting a little
replication lag for browsing, but always using the primary for booking
creation); and use HTTP caching for public consultant data.

**Q: How would you send reminder emails?**
A: Never send email inside the booking transaction. Write an `outbox`
row in the same transaction as the booking. A separate worker polls the
outbox (or a queue fed from it), sends the email via a provider, marks
the row processed, and retries with backoff on failure. Reminders: a
scheduled job finds bookings starting in 24 hours that have not been
reminded. Emails must be idempotent (a `reminded_at` column) because
retries happen.

**Q: How would you handle 10x traffic?**
A: Measure where time goes (logs, metrics, slow-query log, `EXPLAIN`).
Fix the database first: indexes, fewer queries per request (no N+1),
connection pooling. Run more stateless API instances behind the load
balancer. Cache hot reads. Rate-limit abusers. Only then consider
read replicas, queues for slow work, or splitting services.

**Q: What would SlotBook need before real production?**
A: Paid always-on hosting and database tiers, automated backups with
tested restores, monitoring and alerting, error tracking, a security
review and dependency scanning, real email delivery, terms/privacy and
data protection compliance, admin audit logs, load testing, and a
runbook for incidents.

**Q: When would you split into microservices?**
A: Only when there is a real reason: separate teams that need to deploy
independently, very different scaling needs, or isolation of a risky
component. Microservices add network failures, distributed data,
deployment and debugging complexity. A well-structured modular monolith
like SlotBook is the right start, and its modules can be extracted
later.

### 11.11 Behavioural

Use STAR: Situation, Task, Action, Result. Prepare real stories from
building SlotBook — keep them in `docs/interview/stories.md`.

**Q: Walk me through your project's architecture in 2 minutes.**
A: See the project question "Explain SlotBook's architecture" in section
12 and practise it until it takes under two minutes.

**Q: What is the hardest bug you have fixed?**
A: Template — replace with your real story: "While building booking
creation, my sequential tests passed, but I suspected a race. I wrote a
test that fired 20 booking requests for the same slot concurrently, and
3 succeeded. The cause was check-then-insert as two separate
statements, so another insert could slip in between. I moved the rule
into a database trigger that runs inside the insert under SQLite's write
lock, mapped its error to 409, and the test then consistently showed
exactly one success. I learned that invariants under concurrency belong
in the database."

**Q: Tell me about a tradeoff you made.**
A: Template: "I chose server-side sessions over JWT. JWT avoids a
database lookup per request, but SlotBook is a single API, and I needed
instant logout and suspension. Sessions gave me easy revocation at the
cost of one indexed lookup per request, which is cheap. If we later had
many services, I would revisit it."

**Q: How do you use AI tools?**
A: "I use AI as a reviewer and tutor: explaining concepts, reviewing my
code, suggesting edge cases and tests. I write the code myself and only
trust it once tests prove it. For example, I asked for edge cases for
slot generation and added DST tests that caught a bug." (Use your real
example.)

**Q: How do you approach something you do not know?**
A: Read the official docs, build the smallest possible experiment,
verify it with a test or real output, then apply it. Ask for help with
a clear description of what I tried and what I saw.

---

## 12. SlotBook project interview questions

These are the questions an interviewer asks after you say "I built an
appointment booking backend". The model answers describe the design in
this plan. **After building, update every answer to match what you
actually built** — interviewers will dig into details, and your real
numbers, file names and bugs are your best evidence.

### 12.1 Overview

**Q: What is SlotBook, in 30 seconds?**
A: SlotBook is an appointment booking backend I built with Node.js,
TypeScript, Express and Turso (a hosted SQLite-compatible database).
Consultants define services and
weekly availability in their own time zone; customers see free slots,
book and cancel under a policy; admins approve consultants. The hard
parts were time-zone-correct slot generation, preventing double bookings
under concurrent requests with a database constraint, and role- and
ownership-based authorization. It is tested, containerised, and deployed
on free cloud tiers.

**Q: Why did you choose a booking system?**
A: Because it is not plain CRUD. It forces real backend problems: time
zones and DST, overlapping intervals, race conditions, transactions,
state machines, and authorization where different users see different
data.

**Q: Explain SlotBook's architecture.**
A: It is a modular monolith: one Express app organised by feature
modules — auth, consultants, services, availability, bookings, admin.
Each module has routes, zod validation schemas, a service layer for
business rules and a repository with parameterised SQL using
`@libsql/client`. Turso is the source of truth; Upstash Redis handles rate
limiting and caches availability. Cross-cutting middleware handles
request IDs, structured logging with pino, sessions, permissions and a
central error handler. `app.ts` builds the app, `server.ts` starts it
and handles graceful shutdown. The API runs on Render, with CI on
GitHub Actions.

**Q: Walk me through what happens on `POST /api/v1/bookings`.**
A:
1. The request passes the request-ID, logging, JSON body and rate-limit
   middleware.
2. `requireAuth` loads the session from the cookie; no session → `401`;
   suspended user → `401`/`403`.
3. `requirePermission('bookings:create')` checks the role.
4. zod validates the body: `serviceId`, `startAt` (ISO with offset).
5. The service layer loads the service and consultant, rejects if the
   service is archived, the consultant is unapproved, or the customer is
   the consultant.
6. It converts the start to UTC epoch milliseconds, computes `end_at`
   and `block_end_at` (with buffer), and checks the slot against rules,
   exceptions, minimum notice and the advance window.
7. It inserts the booking with snapshot fields and status `confirmed`.
8. If another confirmed booking overlaps, the `BEFORE INSERT` trigger
   aborts with `SLOT_UNAVAILABLE` → the error handler returns `409`.
9. On success it invalidates the availability cache in Redis and returns
   `201` with the booking (times as ISO 8601 strings).

**Q: Why Express and not Fastify or NestJS?**
A: Express is the most widely used Node framework, minimal, and makes me
build structure myself, which is what I wanted to learn: middleware,
routing, error handling. Fastify is faster with built-in schema
validation; NestJS gives an opinionated structure with dependency
injection. Both are good choices; with Express I understand what those
frameworks do for me.

**Q: Why raw SQL with `@libsql/client` instead of an ORM like Prisma or
Drizzle?**
A: To learn SQL, constraints, triggers and transactions directly and see
exactly what runs — which also matters on Turso, where every scanned row
counts against the quota. ORMs are productive but can hide inefficient
queries, and the key feature I needed — the overlap trigger — is plain
SQL anyway. In a team I would happily use an ORM or query builder, and
still drop to SQL for complex queries.

**Q: Why a monolith and not microservices?**
A: One developer, one database, one deployable. A modular monolith keeps
boundaries clear without network calls, distributed transactions or
multiple deployments. The booking invariant relies on one database
transaction, which microservices would make much harder.

**Q: Why Turso?**
A: It is free, has no cold starts, needs no server management, and is
SQLite underneath, so the same SQL runs against a local file in tests
and CI with no cloud database. SQLite's single-writer model makes the
no-overlap rule easy to enforce correctly with a trigger. The tradeoffs:
no range types or exclusion constraints, no built-in time zones (I store
UTC epoch milliseconds and convert with luxon), and one writer at a
time, which limits write-heavy workloads.

**Q: Would Turso work at large scale? When would you switch to
Postgres?**
A: For a booking app, reads far outnumber writes, and SQLite handles
many reads and a steady stream of short writes well. I would move to
Postgres if writes became the bottleneck (many concurrent writers),
or if I needed features like row-level locking, range types, or
mature tooling for analytics. Because the repository layer holds all
SQL, the switch would be contained to that layer and the migrations.

### 12.2 Data model and time

**Q: Walk me through your schema.**
A: All tables are `STRICT`, with `TEXT` UUID IDs and `INTEGER` UTC epoch
millisecond timestamps. `users` (email stored lowercased and unique, password hash, status),
`user_roles` (a user can have several roles), `sessions`,
`consultant_applications`, `consultant_profiles` (time zone, approval),
`services` (duration, price in minor units, buffer, active flag),
`availability_rules` (weekday + local start/end time),
`availability_exceptions` (blocked or extra time ranges), and
`bookings` (consultant, customer, service, `start_at`, `end_at`,
`block_end_at`, status, snapshot columns, cancel reason, timestamps).
Constraints: foreign keys, check constraints on status/duration/price
and `start_at < end_at`, unique email, and the overlap triggers on
bookings.

**Q: Why store times as integers (epoch milliseconds)?**
A: SQLite has no timestamp-with-time-zone type. An integer number of
milliseconds since 1970 UTC is an exact instant: it sorts and compares
correctly, indexes well, and has no time-zone ambiguity. The API
converts to and from ISO 8601 strings at the boundary. The alternative,
ISO text, also sorts correctly only if every value uses the same format
and offset, which is easy to break.

**Q: Why half-open intervals?**
A: `[10:00, 11:00)` includes 10:00 but not 11:00, so a booking ending at
11:00 does not overlap one starting at 11:00. Back-to-back bookings work
naturally, and there are no off-by-one-minute hacks.

**Q: How do you handle time zones?**
A: Instants (bookings, exceptions) are stored as UTC epoch milliseconds
(absolute moments). Each consultant stores an IANA time zone such as
`Asia/Kolkata`. Weekly rules are local wall-clock times ("Monday
09:00–13:00"), because "9 am" means 9 am in their city all year. To
generate slots for a date, I convert the local rule times for that date
in the consultant's zone into UTC instants with luxon (SQLite cannot do
time-zone conversion). The API returns ISO strings
with offsets, so a customer in London can display them in their own
zone.

**Q: How do you handle daylight saving time?**
A: Because rules are stored as local times and converted per date, a
consultant's 9 am stays 9 am across DST changes, while the UTC instant
shifts. For a local time that does not exist (clocks jump forward), the
slot is skipped; for an ambiguous time (clocks go back), I use the first
occurrence. These cases have explicit tests using a DST zone like
`Europe/London`.

**Q: How are slots generated?**
A: For each date in the requested range (max 14 days): take the weekly
rule windows for that weekday plus any "extra" exceptions, convert them
to UTC, subtract blocked exceptions and existing confirmed bookings
(with buffer), then walk each free window in fixed steps and keep starts
where `start + duration` still fits, that are after the minimum notice
and before the advance limit. It is a pure function, so it is unit
tested heavily without a database.

**Q: Why copy service name, duration and price into the booking?**
A: History. If a consultant renames a service or changes its price,
past and upcoming bookings must still show what the customer actually
booked and agreed to pay.

**Q: Why store price as an integer?**
A: Floating-point numbers cannot represent most decimal values exactly
(`0.1 + 0.2 !== 0.3`). Storing paise as an integer avoids rounding
errors. Currency would be a separate column if we supported more than
one.

**Q: What indexes did you add and why?**
A: Indexes that match real queries: bookings by `(customer_id,
start_at)` for "my bookings", a partial index on `(consultant_id,
start_at) WHERE status = 'confirmed'` for the calendar and the overlap
trigger, `services(consultant_id)`, a unique index on `email`, and
`sessions(expires_at)` for cleanup. Each was checked with `EXPLAIN QUERY
PLAN` (looking for `SEARCH ... USING INDEX`, not `SCAN`), which also
keeps Turso row reads low. (Update with your real list.)

### 12.3 Bookings and concurrency

**Q: How do you stop two customers booking the same slot at the same
time?**
A: The database enforces it. A `BEFORE INSERT` trigger on `bookings`
aborts the insert with `SLOT_UNAVAILABLE` if another `confirmed` booking
for the same consultant overlaps (`existing.start_at < new.block_end_at
AND new.start_at < existing.block_end_at`). Turso/SQLite runs one write
at a time, and the trigger runs inside the insert while holding the
write lock, so two concurrent inserts are applied one after the other
and the second one aborts. I return that as `409 SLOT_UNAVAILABLE`. The
application also checks availability first, but only to give a nicer
error — correctness does not depend on it.

**Q: Why not a unique index on `(consultant_id, start_at)`?**
A: That only stops bookings starting at the exact same moment. A 60-minute
booking at 10:00 and a 30-minute booking at 10:30 overlap but have
different starts. Overlap is an interval property, so it needs an
interval comparison — in SlotBook, the trigger.

**Q: Why a trigger and not just a check in the app?**
A: An app check runs as a separate statement before the insert, so
another request can insert in between. The trigger's check is part of
the insert statement itself, inside the write lock, so nothing can slip
in. It also protects against any other code path or script that writes
bookings.

**Q: How did you prove it works?**
A: An integration test that sends, say, 20 booking requests for the same
slot concurrently with `Promise.all`. It asserts exactly one `201`,
nineteen `409`s, and exactly one confirmed booking row. I first ran it
against a naive check-then-insert version and watched it fail, which
proved the test could detect the bug. It runs against a local SQLite
file in CI and against a real Turso test database, because network
timing differs.

**Q: What happens to the time when a booking is cancelled?**
A: The trigger only looks at `confirmed` bookings, so cancelled,
completed and no-show bookings do not block time. Cancelling frees the
slot immediately, and the availability cache is invalidated. A `BEFORE
UPDATE` trigger also runs the overlap check if a booking is ever changed
back to `confirmed` or its times change.

**Q: How do buffers between appointments work?**
A: A service can have buffer minutes. Each booking stores
`block_end_at = end_at + buffer`, and the trigger compares against
`[start_at, block_end_at)`, while the customer sees the appointment
start and end. So the trigger also protects the
consultant's break. (Document exactly how you implemented this.)

**Q: How is the cancellation policy enforced, and is it race-safe?**
A: In one conditional update: `UPDATE bookings SET status =
'cancelled_by_customer' ... WHERE id = ? AND customer_id = ? AND status
= 'confirmed' AND start_at > ? RETURNING *`, where the last parameter is
`now + 24 hours` in epoch milliseconds, computed in the app (which also
lets tests control "now"). If no row is returned, I check why (not
found, not owner, already cancelled, or too late) and return `404` or
`409`. Because the check and the change happen in one statement under
the write lock, two concurrent cancels or a cancel racing with
"complete" cannot both succeed.

**Q: Which status transitions are allowed?**
A: Only from `confirmed`: to `cancelled_by_customer` (before the 24-hour
cutoff), `cancelled_by_consultant` (with a reason, before start), or
`completed`/`no_show` (after the end, by the consultant). All other
statuses are terminal. Invalid transitions return `409`.

**Q: What if the client retries a booking request after a timeout?**
A: Without protection, the retry would either get `409` (its own first
booking took the slot) or create a duplicate for another slot. The
stretch solution is an `Idempotency-Key` header: the server stores the
key and response, and a repeat returns the original booking.

**Q: How would you add temporary holds during checkout?**
A: Add a `held` status with `expires_at`, include unexpired `held`
bookings in the trigger's blocking condition, and treat expired holds as
non-blocking — either a job that expires them or by converting
expired holds before inserting. Confirming a hold is a conditional
update from `held` to `confirmed` if not expired.

**Q: How would you do the same thing in Postgres or MySQL?**
A: Both allow many concurrent writers, so the trigger approach alone
would not be safe there. In Postgres I would use a `tstzrange` column
and an exclusion constraint (`EXCLUDE USING gist (consultant_id WITH =,
time_range WITH &&) WHERE (status = 'confirmed')`, with `btree_gist`),
which fails the second insert with `23P01`. MySQL has no exclusion
constraints, so I would lock the consultant row with `SELECT ... FOR
UPDATE` inside a transaction, check for overlaps, then insert. (Add
what you saw in the Milestone 9 labs.)

### 12.4 Authentication and RBAC

**Q: How does login work in SlotBook?**
A: The user posts email and password. I look up the user by lowercase
email, verify the password with Argon2id, reject suspended accounts,
create a session row, and set an `HttpOnly`, `Secure`, `SameSite=Lax`
cookie with a random session ID. Wrong email and wrong password return
the same `401` message, and login is rate-limited.

**Q: Why sessions instead of JWT here?**
A: One API, one database, browser clients. Sessions give instant
logout, suspension and password-change revocation by deleting rows, and
the token stays out of JavaScript's reach in an `HttpOnly` cookie. The
cost is one indexed lookup per request.

**Q: How did you implement RBAC?**
A: Roles are stored in `user_roles` because a user can be both a customer
and a consultant. A permission map in code says which roles have which
permissions (`bookings:cancel`, `services:create`, ...). `requireAuth`
loads the user and roles; `requirePermission('...')` returns `403` if no
role grants it. Ownership is checked separately in the service layer and
in SQL.

**Q: Role check vs ownership check — why both?**
A: The role says "consultants may edit services". Ownership says "only
their own services". Without ownership, any consultant could edit any
other consultant's services by changing the ID in the URL — the IDOR
bug. So queries include the owner: `WHERE id = $1 AND consultant_id =
$2`.

**Q: Why return `404` and not `403` for someone else's booking?**
A: `403` confirms the booking exists, which leaks information and helps
attackers enumerate IDs. `404` treats "not yours" the same as "doesn't
exist". `403` is still used when the role itself lacks the permission,
like a customer calling an admin endpoint.

**Q: How does someone become a consultant or admin?**
A: A customer submits a consultant application; an admin approves it,
which adds the `consultant` role and marks the profile approved in one
transaction. Admins are created only by a seed script or migration,
never through a public endpoint, so nobody can register as admin.

**Q: What happens when an admin suspends a user?**
A: The user's status becomes `suspended` and their sessions are deleted.
`requireAuth` also checks the status on every request, so even a
session created just before suspension stops working. Login is refused.

**Q: How do you stop a user from making themselves admin?**
A: The registration and profile schemas only accept specific fields, so
`role` in the body is rejected (no mass assignment). Roles are only
changed by admin endpoints that require the admin permission, and these
paths are covered by tests.

**Q: What RBAC tests do you have?**
A: Every protected endpoint returns `401` without a session; customers
get `403` on consultant and admin endpoints; customer A gets `404` for
customer B's booking and cannot cancel it; consultant A cannot edit
consultant B's services or availability; a consultant cannot book
themselves; a suspended user is rejected with an old session; and
approval grants the consultant role.

**Q: How do you protect against CSRF with cookie sessions?**
A: The cookie is `SameSite=Lax`, so browsers do not send it on
cross-site POST requests; state-changing endpoints are never `GET`; and
I check the `Origin` header against an allow-list for state-changing
requests. CORS only allows the SlotBook frontend origin with
credentials.

**Q: The frontend is in a separate repo. How does login work across
origins?**
A: Locally, the frontend and API are different origins but the same
site, so the API allows the frontend origin via CORS with credentials
and the `SameSite=Lax` session cookie is sent. In production, two free
subdomains are different sites, and browsers increasingly block
third-party cookies, so the frontend host proxies `/api/*` to the API.
The browser then sees one origin and the cookie works as first-party.
The alternatives were bearer tokens (XSS exposure) or a custom domain
(costs money). (Update with what you actually chose.)

### 12.5 Redis, reliability and operations

**Q: What does Redis do in SlotBook?**
A: Two things: a shared rate-limit store for login, registration and
booking creation, and a cache-aside cache for public availability
responses with a short TTL, invalidated when bookings or rules change.
It never decides whether a booking is valid.

**Q: What if Redis is down or flushed?**
A: Availability reads fall back to Turso, so the site is slower but
works. The rate limiter's behaviour on Redis failure is a documented
choice (I chose ___ because ___). Booking correctness is unaffected; I
have a test that clears Redis and confirms a conflicting booking still
gets `409`.

**Q: Why not cache availability for a long time?**
A: Availability changes whenever someone books or cancels. A long TTL
would show taken slots as free. The trigger would still reject the
booking, but users would get frustrating `409`s. Short TTL plus explicit
invalidation keeps it fresh.

**Q: How do you handle errors consistently?**
A: Business errors are thrown as an `AppError` with an HTTP status and a
code like `SLOT_UNAVAILABLE`. The central error middleware converts
them, plus zod errors (`400`) and known SQLite constraint errors from
`@libsql/client` (unique violation → `409`, the overlap trigger's
`SLOT_UNAVAILABLE` → `409`, foreign key violation → `400`/`404`), into
the same JSON shape with the request ID. I map them by the error's code
and message after inspecting real error objects in tests. Unknown
errors are logged with the stack trace and return a generic `500`.

**Q: How do you log?**
A: Structured JSON logs with pino: each request gets a request ID that
is included in every log line and in error responses. I log method,
path, status and duration, but never passwords, session IDs or full
request bodies.

**Q: How do you configure the app across environments?**
A: Environment variables (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
`REDIS_URL`, `SESSION_SECRET`, `NODE_ENV`, `PORT`, `CORS_ORIGINS`)
validated with zod at startup. If
something is missing or invalid, the app refuses to start with a clear
message instead of failing later at runtime.

**Q: How do your health checks work?**
A: `/health` returns `200` if the process is running, with no database
call. `/ready` runs a quick `SELECT 1` (and a Redis ping) and returns
`503` if a dependency is down. Render uses the health check path to
decide if a deploy is healthy.

**Q: How does graceful shutdown work in your app?**
A: On `SIGTERM` or `SIGINT`, the server stops accepting new connections,
waits for in-flight requests up to a timeout, closes the libSQL client
and the Redis client, logs, and exits. A second timeout force-exits if
something hangs.

**Q: How are migrations run in deployment?**
A: As an explicit step (`npm run migrate`) with my own runner, which
applies new `.sql` files in order and records them in
`schema_migrations`, before the new version starts — not silently on
every app boot. Migrations
are backwards-compatible with the running version (expand/contract), so
a deploy does not break requests in flight.

**Q: What does your CI pipeline do?**
A: On every push and pull request, GitHub Actions installs dependencies
with `npm ci`, runs ESLint and the TypeScript compiler, then runs the
unit and integration tests against a fresh local SQLite file, so CI
needs no database secrets and uses no Turso quota. Render deploys only
from the main branch.

**Q: Explain your Dockerfile.**
A: A multi-stage build: the build stage installs all dependencies and
compiles TypeScript; the runtime stage uses a slim Node image, installs
only production dependencies, copies the compiled code, runs as the
non-root `node` user, and starts with `node dist/server.js`.
`.dockerignore` excludes `node_modules`, `.env` and `.git`. (Describe
your real file and image size.)

### 12.6 Deployment, limits and next steps

**Q: How is SlotBook deployed, and what does it cost?**
A: Nothing. The API runs on Render's free web service, the database on
Turso's free plan, Redis on Upstash's free plan, and CI on GitHub
Actions. The frontend is a separate repo of plain HTML/CSS/JS on a free
static host that proxies `/api` to the API.

**Q: What are the limitations of this deployment?**
A: Render's free instance sleeps after 15 minutes idle, so the first
request takes about a minute; there are monthly quotas (Turso rows read
and written, which block the database when exceeded, and Upstash
commands); the database has a single writer; there is a single region;
only a 1-day restore window; no monitoring or
alerting; and no SLA. Fine for a portfolio, not for real customers.

**Q: What would you change for real production?**
A: Paid always-on hosting with at least two instances, a paid database
plan with longer backups and tested restores, monitoring and alerting,
error tracking, real email via an outbox worker, a security review and
dependency scanning, audit logs for admin actions, load testing of the
booking path, and documented runbooks.

**Q: How would you add payments?**
A: Create a booking as a time-limited `held` status, create a payment
with a provider, and confirm the booking only when the provider's
webhook says it succeeded. Webhooks must be verified (signature) and
idempotent, holds expire if payment fails, and refunds follow the
cancellation policy. Money is never processed inside a long database
transaction.

**Q: How would SlotBook handle 100,000 consultants?**
A: The design mostly holds: indexes on consultant-scoped queries,
availability is computed per consultant and cached, and the partial
index keeps the overlap trigger's check fast. I would add search
(full-text or a search service) for consultant discovery, Turso read
replicas or embedded replicas for browsing, horizontal API scaling, and
measure before doing anything else. If booking writes became the
bottleneck under SQLite's single writer, I would move to Postgres (or
split data per region/tenant into separate databases).

**Q: What was the hardest part of the project?**
A: Answer with your real experience. Likely candidates: understanding
why check-then-insert fails and proving the fix with a concurrent test,
or getting DST-correct slot generation.

**Q: What would you do differently if you started again?**
A: Answer honestly after building. Possible examples: write the
concurrency test earlier, design the error format before the first
endpoint, or define the time-handling rules in writing before writing
code.

**Q: What did you learn from comparing Turso with Postgres and MySQL?**
A: Fill in from the lab. Expected points: Turso/SQLite relied on the
single writer plus a trigger, had simpler types, and its row-read
billing made missing indexes visible; Postgres could enforce no-overlap
declaratively with an exclusion constraint and handles many concurrent
writers; MySQL needed explicit row locks in the application.

---

## 13. Free-tier safety rules

- No payment card on Upstash, Turso, Neon or Render unless I decide to
  upgrade deliberately.
- Turso databases: `slotbook` (dev), `slotbook-test` (remote tests),
  and later a separate production database or token. Everyday tests use
  a local SQLite file, not the cloud.
- Treat Turso auth tokens as passwords: separate tokens per environment,
  read-only tokens where writes are not needed, an expiry date, never
  pasted into chats or screenshots.
- Never commit connection strings or tokens; rotate any secret that
  leaks.
- Expect Render cold starts (~1 min after 15 min idle) and handle
  database/network retries gracefully.
- Monitor usage dashboards monthly (Turso rows read/written and storage,
  Upstash commands). A Turso quota overrun **blocks** the database until
  next month.
- Export the Turso database occasionally as a SQLite file (backup), and
  keep the local-file setup working so learning can continue if a free
  tier changes.

---

## 14. Definition of done

I can:

- Explain the request lifecycle in Express from socket to response
- Draw the schema and justify every constraint and index
- Prove with a test that concurrent bookings cannot overlap, and explain
  why
- Explain the RBAC matrix, ownership checks and 401/403/404 choices
- Explain what Redis does in SlotBook and what happens if it disappears
- Compare Turso with Postgres and MySQL from hands-on experience
- Build and run the Docker image, and deploy the API for free
- Debug a failure from logs using a request ID
- Run the project from a clean clone using only the README
- List the limitations of the free deployment and what production needs
- Answer every question in sections 11 and 12 out loud without notes,
  using my real SlotBook code as examples

---

## 15. Progress tracker

- [ ] M0 Setup
- [ ] M1 Express and HTTP
- [ ] M2 Turso and SQL
- [ ] M3 Consultants and services
- [ ] M4 Authentication
- [ ] M5 RBAC and ownership
- [ ] M6 Availability
- [ ] M7 Bookings and concurrency
- [ ] M8 Redis (Upstash)
- [ ] M9 Postgres and MySQL labs
- [ ] M10 Production-minded quality + CI
- [ ] M11 Docker
- [ ] M12 Free cloud deployment
- [ ] M13 Plain frontend
- [ ] Section 11 general interview answers practised
- [ ] Section 12 project answers updated to match the real build
- [ ] Mock interview: 2-minute architecture walkthrough + 3 real STAR
  stories

**Next step for a fresh session:** start Milestone 0 — check tool
versions and initialise the project manually.
