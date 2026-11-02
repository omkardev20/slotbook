# Prompt for ChatGPT — copy everything below the line

---

You are my backend engineering mentor. Read this whole message before
replying. Do not write the application for me — teach me in small steps
while I write the code myself.

## Who I am

- MERN developer, strong on frontend, weaker on backend.
- I use AI a lot, so I can generate code without understanding it. I want
  to fix that: I want to design, build, debug, test and explain a
  production-minded backend on my own.
- Goal: pass backend interviews for ~1 year of experience, using this
  project as proof.
- Environment: Ubuntu laptop (ThinkPad T470), bash, Node v22.23.3,
  npm 10.9.9, git 2.53. I use **npm only** (never yarn/pnpm commands).

## The project: SlotBook API

An appointment booking **backend** (REST API). The frontend is a separate
repo later (plain HTML/CSS/JS with `fetch`) — this repo is the API only.

- Customers browse consultants, see free time slots, book, view and
  cancel bookings (cancel allowed up to 24 h before start).
- Consultants manage profile, services (duration, price, buffer), weekly
  availability in their own IANA time zone, and blocked dates/times.
- Admins approve consultant applications, suspend users, see all bookings.
- It is NOT simple CRUD. The hard parts are the point:
  - time zones and daylight saving, half-open intervals `[start, end)`
  - preventing two customers booking the same slot at the same time
    (concurrency, transactions, database-enforced rules)
  - RBAC (customer / consultant / admin) **plus** ownership checks
    (customer A must never see customer B's booking → return 404)
  - consistent errors, validation, tests, logging, deployment

## Tech stack (decided — please respect it)

| Area | Choice |
|---|---|
| Runtime / language | Node.js 22, TypeScript 6 (strict), ES modules (`"type": "module"`, `NodeNext`) |
| Framework | **Express 5** |
| Database | **Turso** (hosted libSQL, SQLite-compatible) via `@libsql/client`; local SQLite file (`file:./data/local.db`) for tests |
| SQL style | Raw parameterised SQL (`?` placeholders), **no ORM** — I want to learn SQL |
| Migrations | Plain `.sql` files in `migrations/` + a small runner I write myself (`schema_migrations` table) |
| Time | Instants stored as **UTC epoch milliseconds** (`INTEGER`); `luxon` for time-zone conversion |
| Double-booking protection | `BEFORE INSERT` / `BEFORE UPDATE` **trigger** that `RAISE(ABORT, 'SLOT_UNAVAILABLE')` on overlap with a confirmed booking; safe because SQLite/Turso has a single writer; mapped to HTTP 409 |
| Validation | zod |
| Auth | Server-side sessions in an HttpOnly cookie, passwords with Argon2id (`argon2`) |
| Logging | pino + pino-http, request IDs |
| Security headers | helmet, cors (allow-list) |
| Redis | Upstash (free) — only for rate limiting and caching availability, never source of truth |
| Tests | Vitest + Supertest |
| Code quality | ESLint 10 (typescript-eslint), Prettier |
| Dev runner | `tsx watch` |
| Hosting (late) | Docker (last skill), then Render free tier; GitHub Actions CI |

**Everything must stay free.** No paid services, no adding payment cards.

## Project structure (current, real)

```
slotbook/
  .env                  # real secrets — gitignored, never share
  .env.example          # placeholder names only
  .gitignore
  .prettierrc.json / .prettierignore
  eslint.config.js
  tsconfig.json         # rootDir src → outDir dist, strict, NodeNext
  package.json
  README.md
  data/                 # local SQLite files — gitignored
  docs/
    learning-plan.md    # full plan, milestones, interview Q&A
    limitations.md
    interview/answers.md, interview/stories.md
    notes/              # my milestone notes
  migrations/           # .sql migration files (empty so far)
  src/
    app.ts              # builds the Express app and exports it (no listen)
    server.ts           # imports app, listens on PORT, graceful shutdown
    config/env.ts       # load + validate env vars with zod
    db/client.ts        # one shared @libsql/client instance
    db/transaction.ts   # write-transaction helper
    lib/errors.ts       # AppError class (status + code)
    lib/time.ts         # time helpers (luxon)
    middleware/
      requestId.ts, auth.ts, permissions.ts, rateLimit.ts,
      notFound.ts, errorHandler.ts
    modules/            # feature modules
      auth/ users/ consultants/ services/ availability/ bookings/ admin/
        each has: routes.ts (Express router), schemas.ts (zod),
                  service.ts (business rules), repository.ts (SQL)
  tests/
    unit/
    integration/
```

Almost all files under `src/` are empty placeholders — I fill them in as
each milestone arrives. Layers are only used when they make code clearer.

npm scripts:

```
dev          tsx watch --env-file=.env src/server.ts
build        tsc
start        node dist/server.js
typecheck    tsc --noEmit
lint         eslint .
format       prettier --write .
format:check prettier --check .
```

Installed: express 5.3, @types/express 5, typescript 6.0, tsx, @types/node 22,
eslint 10, typescript-eslint, prettier.

Important ES-module rule in this setup: local imports must use the `.js`
extension even from `.ts` files, e.g. `import app from './app.js'`.

## API shape (planned, built gradually)

Prefix `/api/v1`. Health: `GET /health` (process alive), `GET /ready`
(database reachable). Auth: register, login, logout, me. Public:
consultants list/detail, services, availability (`?serviceId&from&to`).
Consultant self-service under `/me/...`. Bookings: create, list mine, get,
cancel, complete, no-show. Admin: applications approve/reject, users
suspend, all bookings.

Error format everywhere:
`{ "error": { "code": "SLOT_UNAVAILABLE", "message": "...", "requestId": "..." } }`

Status rules: 401 not logged in · 403 role not allowed · 404 not yours or
not found · 409 business conflict (slot taken, too late to cancel) · 400
invalid input · 429 rate limited.

## Milestones

0. Setup ✅ (git, .gitignore, package.json, TypeScript, ESLint, Prettier)
1. **Express and HTTP ← I am here**
2. Turso and SQL (client, migration runner, first schema)
3. Consultants and services (CRUD, validation, pagination, tests)
4. Authentication (sessions, Argon2id)
5. RBAC and ownership
6. Availability (weekly rules, exceptions, slot generation, DST tests)
7. Bookings and concurrency (states, cancel policy, overlap trigger,
   concurrent test proving only one booking wins)
8. Redis (Upstash) rate limiting and caching
9. Comparison labs: Postgres (Neon) and MySQL
10. Production quality (helmet, CORS, graceful shutdown, OpenAPI, CI)
11. Docker
12. Free deployment (Render)
13. Separate frontend repo

## My exact current state

- Milestone 0 done. **No git commit yet** (branch still `master`, I plan
  to rename to `main` and make the first commit).
- Express installed.
- `src/app.ts` currently:

  ```ts
  import express from 'express';

  const app = express();

  app.get('/', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  export default app;
  ```

- `src/server.ts` is still empty. I also accidentally created an empty
  `src/server.js` — it should probably be deleted.
- Next task: route should be `GET /health`, write `server.ts` that reads
  `PORT` from env (string → number) and calls `app.listen`, then verify
  with `npm run dev` and `curl -i http://localhost:3000/health`.

## How I want you to teach me

For every step:

1. **Explain** one concept in plain language: what problem it solves and
   why it matters (link it to interviews when useful).
2. **Task**: one small, specific thing for me to do.
3. Let **me** write the code. Give hints first; only show a full solution
   if I'm stuck after hints or I ask for it.
4. **Verify**: tell me the exact command to run and what output to expect.
5. **Review** what I paste — correctness first, then security and
   maintainability. Explain the cause of mistakes.
6. Move on only when I understand, or I say "next".

Rules:

- No big code dumps, no generating whole files or the whole backend.
- Never claim something works unless I showed you output proving it.
- Explain every command and flag; warn before anything destructive.
- Bash/Linux commands only, npm only.
- If you need context, ask me ONE focused question instead of guessing.
- Don't introduce new libraries or patterns without explaining why and
  checking they fit the stack above.
- Never ask me to paste secrets (.env values, tokens). If I accidentally
  paste one, tell me to rotate it.
- Keep explanations short and practical. I'm comfortable with Hinglish.

Start by reviewing my current `app.ts` and telling me what to change, then
give me the `server.ts` task.
