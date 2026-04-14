# Level Test — School Assessment Web App

Stack: **React (Vite) + Tailwind + Recharts**, **Node.js + Express**, **PostgreSQL**, **Prisma**, **JWT**, **Multer**, **mammoth** (Word → text).

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ (local or remote)

## 1. Database

Create a database and user, then set `DATABASE_URL` in `server/.env`:

```bash
# Example
createdb level_test_app
```

Copy [`server/.env.example`](server/.env.example) to `server/.env` and adjust credentials.

Apply migrations:

```bash
cd server
npx prisma migrate deploy
```

## 2. Install and seed

From the **repository root**:

```bash
npm install
cd server
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

Demo accounts (from seed):

| Role   | Login              | Password     |
|--------|--------------------|--------------|
| Admin  | `admin@school.local` | `password123` |
| Teacher| `teacher@school.local` | `password123` |
| Student| `STU001`           | `password123` |

## 3. Run development

Terminal 1 — API (port 4000):

```bash
cd server
npm run dev
```

Terminal 2 — Web (port 5173, proxies `/api` to the API):

```bash
cd client
npm run dev
```

Open `http://localhost:5173`. Students use **Student ID** + password; staff use **email** + password.

Optional: set `client/.env` with `VITE_API_URL=http://localhost:4000` if you prefer not to use the Vite proxy.

## 4. Word question import (admin)

Upload a `.docx` file via `POST /api/v1/admin/questions/import` (multipart field `file`, plus form fields `subjectId`, `levelId`, `topicId`, optional `difficulty`). The server uses **mammoth** to extract plain text, then parses blocks like:

```text
Q1. What is 2 + 2?
A) 3
B) 4
C) 5
D) 6
Answer: B

Q2. Next question...
```

Questions are stored in the **shared topic bank** (same questions can be used across classes). Duplicates are skipped using a content hash.

## 5. Level tests and topic banks

- Per **level**, `LevelTestConfig` sets how many questions are drawn (e.g. **8** for Level 0 in the seed).
- `LevelTopicParticipation` lists which **topics** feed the test and optional **per-topic quotas** (if omitted, remaining slots are split evenly).
- Tests pick random questions from each topic’s bank without replacement; if a topic is short, the API returns **warnings** and may backfill from the combined pool.

## API base

- `POST /api/v1/auth/login` — body: `{ "studentId", "password" }` or `{ "email", "password" }`
- `GET /api/v1/auth/me` — Bearer JWT
- Student routes under `/api/v1/student/*`
- Teacher routes under `/api/v1/teacher/*`
- Admin routes under `/api/v1/admin/*`

## Production build

```bash
npm run build
```

Run the API with `node server/dist/index.js` after `cd server && npm run build` (ensure `DATABASE_URL` and `JWT_SECRET` are set).

## Project layout

- `server/` — Express API, Prisma schema, migrations, seed, Word import
- `client/` — React SPA, responsive layout (sidebar on desktop, menu on small screens)
