# 08 — Running the app

**Status:** stub. The stack has not been committed yet, so this doc is a skeleton. Fill in each section once decisions are made. Update this file in the same commit that introduces the relevant tooling.

## Prerequisites

- Node.js (version: TBD — pin in `.nvmrc` and `package.json`'s `engines` field once chosen).
- A Supabase or Pocketbase instance. See `§Backend` below.

## Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd writing-app
npm install

# 2. Copy env template
cp .env.example .env.local
# Edit .env.local with your backend credentials.

# 3. Run migrations (command TBD once backend is chosen).

# 4. Start dev server
npm run dev
```

## Environment variables

List every variable here, with a one-line description and whether it's required. Mirror this list in `.env.example`.

```
# TBD — fill in when backend is chosen. Examples:
# SUPABASE_URL=
# SUPABASE_ANON_KEY=
```

## Scripts

| Command          | What it does                        |
|------------------|-------------------------------------|
| `npm run dev`    | Start local dev server with HMR     |
| `npm run build`  | Production build                    |
| `npm run preview`| Serve the production build locally  |
| `npm test`       | Run unit tests                      |
| `npm run lint`   | Run ESLint / formatter              |
| `npm run typecheck` | Run TypeScript in no-emit mode   |

(Fill in once the build tool is chosen.)

## Backend

**Decision pending.** See `docs/02-current-state.md` for when this gets resolved. Options under consideration:

- **Supabase (hosted).** Zero-ops for auth, Postgres, realtime. Vendor lock-in to the managed service, but exportable (raw Postgres underneath).
- **Pocketbase (self-hosted).** Single Go binary, SQLite backend, ships auth + realtime. No vendor dependency, but the user operates the server.

Whichever is chosen: pin the schema as SQL migration files in `db/migrations/`, even if the backend has a UI for schema editing. The migrations are the source of truth, not the live database.

## Deploying

TBD. Options:

- **Vercel / Netlify** for the static PWA build. Backend hosted separately (Supabase) or on a small VPS (Pocketbase).
- Single-host option: Pocketbase binary on a VPS, serving both the static build and the API.

## Testing

```bash
npm test               # unit tests for lib/
npm run test:integration  # tests that hit a local DB
```

See `docs/05-conventions.md` §Testing for what should be tested and what shouldn't.

## Troubleshooting

Log gotchas here as they come up. Empty for now.
