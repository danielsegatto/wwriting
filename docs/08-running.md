# 08 — Running the app

This document describes the repo as it exists now. If the setup changes,
update this file in the same commit.

## Prerequisites

- Node.js installed locally. The repo does not yet pin a version in
  `.nvmrc` or `package.json#engines`, so use a current Node release that
  can run Vite 8.
- A Supabase project with email/password auth enabled.

## Setup

```bash
# 1. Clone and install dependencies
git clone <repo-url>
cd wwriting
npm install

# 2. Create local env file
cp .env.local.example .env.local

# 3. Start the app
npm run dev
```

After copying `.env.local.example`, replace the example values in
`.env.local` with your own Supabase project settings before trying to log in.

## Environment variables

Copy `.env.local.example` to `.env.local`. The app currently requires:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

- `VITE_SUPABASE_URL`: Supabase project URL from
  Dashboard -> Project Settings -> API
- `VITE_SUPABASE_ANON_KEY`: Supabase publishable / anon key from the same
  API settings page

If either variable is missing, `src/lib/supabase.ts` reports a visible runtime
error instead of failing silently.

For GitHub Pages deployments, these same variables must be present in the
GitHub Actions build environment. Vite replaces `import.meta.env.*` at build
time, so a static deploy cannot "pick them up later" in the browser.

## Database setup

The schema lives in
`src/db/migrations/001_initial_schema.sql`.

Current workflow:

1. Open the Supabase SQL editor for your project.
2. Paste in `src/db/migrations/001_initial_schema.sql`.
3. Run it once.

The migration is intentionally idempotent, so re-running it is safe.

Notes:

- The repo is not using the Supabase CLI migration workflow yet.
- `src/db/types.ts` is hand-written for now. After applying the migration to a
  real project, you can regenerate types with:

```bash
npx supabase gen types typescript --project-id <project-id>
```

## Scripts

These are the scripts currently defined in `package.json`:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Run `tsc -b` and produce a production build with Vite |
| `npm run lint` | Run ESLint |
| `npm run preview` | Serve the production build locally |

Current limitations:

- There is no `npm test` script yet.
- There is no dedicated `npm run typecheck` script yet; type-checking currently
  happens as part of `npm run build`.

## Auth

Authentication is handled by Supabase Auth through
`@supabase/auth-ui-react`.

- Supported flow: email/password sign-in, sign-up, and password reset
- Not currently configured: OAuth providers

## Deploying

The app is deployed to GitHub Pages at:

- `https://danielsegatto.github.io/wwriting/`

Current deployment shape:

- Frontend: GitHub Actions runs `npm ci` and `npm run build`, then deploys
  `dist/` to GitHub Pages via `.github/workflows/deploy.yml`
- Backend: Supabase-hosted auth, Postgres, and realtime

Required GitHub repository secrets for deploys:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Important:

- The Pages source should be `GitHub Actions`, not the legacy branch source.
- Because the site is served from a repo subpath, `vite.config.ts` sets
  `base: '/wwriting/'` for production builds.
- The deploy workflow now fails before publishing if the required Supabase
  build variables are missing, instead of shipping a broken bundle.

## Verification

Quick local verification loop:

```bash
npm run lint
npm run build
```

Then run `npm run dev`, sign in with a Supabase user, and confirm the app
loads past the auth screen.

## Troubleshooting

- Blank or broken auth flow on startup: confirm `.env.local` exists and that
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set correctly.
- GitHub Pages loads but the app crashes before auth renders: confirm the repo
  has GitHub Actions secrets named `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`, then rerun the Pages workflow.
- Database errors after login: re-run
  `src/db/migrations/001_initial_schema.sql` in the Supabase SQL editor and
  confirm the authenticated user has the expected tables and RLS policies.
