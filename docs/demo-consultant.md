# Demo: sign up and log in as a consultant

A consultant goes through four stages. Each one changes what the API returns.

| Stage | `isValid` | `isApproved` | Can log in? | Passes `requireRole('consultant')`? |
|---|---|---|---|---|
| 1. Registered, code not entered | `false` | `false` | no | no |
| 2. Code entered (email verified) | `true` | `false` | yes | **no**, waiting for admin |
| 3. Admin approves | `true` | `true` | yes | yes (after the next refresh or login) |

## One-time setup

```bash
npm run migrate        # applies all migrations
# put ADMIN_EMAIL and ADMIN_PASSWORD in .env, then:
npm run seed:admin     # creates the admin who will approve consultants
npm run dev            # starts the API
```

In the commands below, set the port from your `.env`:

```bash
BASE=http://localhost:3000        # use your PORT
```

## The demo with curl

Each person gets their own cookie jar (`-c` saves cookies, `-b` sends them).

### 1. Register as a consultant (isValid becomes false)

```bash
curl -s -X POST $BASE/auth/register -H 'content-type: application/json' \
  -d '{"name":"Dr Asha","email":"asha@example.com","password":"correct-horse","role":"consultant"}'
```
```json
{ "email": "asha@example.com", "expiresInSeconds": 600 }
```
The account now exists with `isValid: false`. Trying to log in at this point fails.

### 2. Get the code

- **SMTP configured:** open the email "XXXXXX is your SlotBook verification code".
- **SMTP not configured (development):** read it from the terminal running `npm run dev`:
  `Signup OTP for asha@example.com: 482913`

### 3. Verify the email (isValid becomes true)

```bash
curl -s -c consultant.jar -X POST $BASE/auth/register/verify -H 'content-type: application/json' \
  -d '{"email":"asha@example.com","otp":"482913"}'
```
```json
{ "user": { "id": "…", "email": "asha@example.com", "name": "Dr Asha", "isValid": true,
            "roles": [ { "role": "consultant", "isApproved": false } ] } }
```
The consultant is logged in (`consultant.jar` holds the cookies), but `isApproved` is `false`.

### 4. Log in as the admin and approve

```bash
curl -s -c admin.jar -X POST $BASE/auth/login -H 'content-type: application/json' \
  -d '{"email":"YOUR_ADMIN_EMAIL","password":"YOUR_ADMIN_PASSWORD"}'

# who is waiting?
curl -s -b admin.jar $BASE/admin/consultants

# approve (use the id from the list above)
curl -s -b admin.jar -X POST $BASE/admin/consultants/THE_CONSULTANT_ID/approve
```

The consultant is emailed **"Your SlotBook consultant account is approved"** the moment this call
succeeds (sent in the background; with no SMTP configured the server log says it was not sent).
Approving the same consultant again changes nothing and sends no second email.
Only a verified consultant can be approved. An unverified one returns `404`.
Set `APP_URL` in `.env` to add a **Log in to SlotBook** button to the email.

### 5. Log in as the consultant

```bash
curl -s -c consultant.jar -X POST $BASE/auth/login -H 'content-type: application/json' \
  -d '{"email":"asha@example.com","password":"correct-horse"}'
```
```json
{ "user": { "…": "…", "roles": [ { "role": "consultant", "isApproved": true } ] } }
```
`isApproved` is now `true`, and the new access token carries it.
(A consultant who was already logged in sees the change after the next `POST /auth/refresh`, or within 15 minutes.)

```bash
curl -s -b consultant.jar $BASE/auth/me          # who am I?
curl -s -b consultant.jar $BASE/admin/consultants   # 403: a consultant is not an admin
```

## The demo in Swagger (`/docs`)

Swagger sends your browser's cookies automatically, and the cookie names are the same for every user.
So **logging in as someone else replaces the previous login.** Use two browser profiles (or a normal and a
private window) if you want the admin and the consultant open at the same time.

1. **Auth → Step 1: register**: Try it out, role `consultant`, Execute. Expect `202`.
2. Read the code from your email (or the terminal).
3. **Auth → Step 2: verify**: email and code. Expect `201`, `isValid: true`, `isApproved: false`.
4. **Auth → login**: use the admin's email and password (this replaces the consultant's cookies).
5. **Admin → Consultants waiting for approval**: Execute, and copy the consultant's `id`.
6. **Admin → Approve a consultant**: paste the id. Expect `isApproved: true`.
7. **Auth → login**: as the consultant again. Roles now show `isApproved: true`.

## Things people trip on

- **"Invalid email or password" right after registering:** the email is not verified yet (`isValid: false`).
  Do step 3 first.
- **`OTP_INVALID`:** wrong, expired (10 minutes) or used up (5 wrong tries, both configurable in `.env`).
  The unverified account is deleted, so register again.
- **Registered twice quickly and got no second code:** inside the 60-second cooldown nothing changes
  and the first code stays valid. Wait a minute to get a fresh one.
- **Consultant gets 403 on consultant-only routes:** not approved yet, or approved but their access token
  is older than the approval. Log in again or call `POST /auth/refresh`.
