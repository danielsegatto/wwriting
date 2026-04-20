# 07 — Ask the human first

These are changes and decisions that must not be made silently. When you hit one of these, stop and ask the human in chat before doing the work. Do not guess.

## Schema changes

- Any change to the columns of `blocks`, `conversations`, `folders`, `tags`, `block_tags`, `block_references`, or `user_settings`.
- Any new table.
- Any change to an enum (`blocks.type`, `block_tags.source`).
- Any change to an index.

Why ask: the data model is load-bearing. Migrations on user data are one-way doors.

## Reversing or modifying entries in `docs/04-decisions.md`

If you're about to do something that contradicts a decision in that log, stop. Either the decision needs to be revisited (in which case the human decides), or you've misread it.

## Adding a dependency

Before `npm install`ing a new package, ask. Reason with the human:
- Why it's needed.
- What it weighs (bundle size matters — mobile-first, iPhone 8 baseline).
- Whether a standard-library or in-repo utility would do the job.
- Its maintenance status.

Exception: packages obviously called for by the stack (e.g., the Supabase SDK when setting up Supabase). Those don't need pre-approval, but do note them in the commit message.

## Changing the framework or build tooling

React vs. Svelte vs. Solid. Vite vs. anything else. Tailwind vs. custom CSS. If the choice hasn't been committed yet (see `docs/02-current-state.md`), discuss options with the human before picking.

Once chosen, do not swap frameworks without explicit approval.

## Renaming or restructuring `docs/`

The doc structure (numbered, specific-purpose files) is deliberate. Don't collapse them into a single `CONTRIBUTING.md` or split a single doc into many. If a doc grows too large, discuss before splitting.

## Data destructive operations

- Writing migrations that drop columns or tables.
- Scripts that modify existing user data.
- Changes to the export format (breaks backups).

## Touching the auth or sync layer in ways that affect at-rest data

- Password hashing scheme.
- Session token lifetimes.
- Any change to what data leaves the device.

## When the human disagrees with what's written here

The docs are the current snapshot. If the human's instruction in chat contradicts a doc, follow the human and update the doc in the same commit. Note the divergence in the commit message so the reasoning is preserved.

## When you are unsure whether to ask

Ask. The cost of a brief interruption is much lower than the cost of undoing a silently-made wrong call.
