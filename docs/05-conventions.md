# 05 — Conventions

Follow these. If you disagree, raise it with the human before diverging.

## Naming

- **Database tables and columns:** `snake_case`. Plural table names (`blocks`, `conversations`).
- **TypeScript / JavaScript identifiers:** `camelCase` for variables and functions, `PascalCase` for types and components.
- **Files:**
  - React components: `PascalCase.tsx` (e.g., `BlockList.tsx`)
  - Utilities, hooks, non-component modules: `camelCase.ts` (e.g., `fractionalIndex.ts`)
  - Tests: same stem as the file they test, with `.test.ts` suffix.
- **Route paths (if using a router):** kebab-case for segments (e.g., `/password-reset`).

## Domain terms

Use these exact words. They are capitalized as proper nouns in docs; in code, they are identifiers.

| Term         | In docs      | In code                       |
|--------------|--------------|-------------------------------|
| Block        | "a Block"    | `block`, `Block`, `blocks`    |
| Conversation | "a Conversation" | `conversation`, `Conversation` |
| Folder       | "a Folder"   | `folder`, `Folder`            |
| Tag          | "a Tag"      | `tag`, `Tag`                  |
| Reference    | "a Reference"| `reference`, `Reference`      |

Avoid synonyms: don't write "message" for Block, "chat" for Conversation, "label" for Tag, "link" for Reference, "directory" for Folder. Consistency across docs, UI strings, and code makes the codebase legible.

## File layout

```
src/
├── app/                 ← routes / top-level pages
├── components/          ← reusable UI components
│   ├── block/
│   ├── sidebar/
│   └── composer/
├── lib/                 ← domain logic, not UI
│   ├── blocks.ts        ← CRUD for blocks
│   ├── conversations.ts
│   ├── folders.ts
│   ├── tags.ts
│   ├── references.ts
│   ├── markdown.ts      ← parse/render with custom tokens
│   ├── fractionalIndex.ts
│   └── auth.ts
├── db/                  ← migrations, supabase types, RLS policies
├── styles/
└── main.ts / main.tsx
```

Rule of thumb: if a module touches the DOM or React, it goes in `components/` or `app/`. If it doesn't, it goes in `lib/`. `lib/` should be testable in isolation from a browser.

## Code style

- **TypeScript strict mode.** No implicit `any`.
- **No `any`.** If you need to escape the type system, use `unknown` with a narrowing function. `any` is a smell.
- **Prefer early return over nested conditionals.**
- **Avoid default exports.** Named exports everywhere. Exception: framework conventions that require a default export (e.g., route file in some routers).
- **Comments explain *why*, not *what*.** If a comment is narrating the code, delete the comment. If a comment explains a non-obvious constraint or a decision, keep it and link to `docs/04-decisions.md` when relevant.
- **No magic numbers in UX code.** The "long Block" threshold, debounce durations, etc. live in a `constants.ts` with named exports.

## Error handling — all errors must be visible in the UI

See `docs/04-decisions.md` §014. The short version:

- **Never swallow errors silently.** No empty `catch {}` blocks. No lone `console.error(e)`. Every caught error routes through the central reporter.
- **Use the reporter:** `report('error', message, details?)`, also `'warn'` and `'info'`. Located in `src/lib/errors.ts` (or equivalent).
- **Global handlers are set up once at startup** for `window.error` and `window.unhandledrejection` to catch anything that escapes.
- **User-facing error messages** (in banners, toasts) are short and human-readable. The full technical detail goes in the event log.
- **The reporter also writes to console** where available, so a developer with devtools still gets standard output.

## Git conventions

### Commits as context for future AI sessions

Every commit message in this repo is written with one audience in mind: a future AI session that will read `git log` to orient itself. That means a commit message is not just "what I did" — it is a durable record of *why* the change happened, *what else was considered*, and *what the reader needs to know to work on top of it*.

This is a real constraint, not a stylistic preference. See `docs/04-decisions.md` §015 for the rationale.

**Branch names:** `feature/short-kebab-case`, `fix/short-kebab-case`, `docs/short-kebab-case`.

**Subject line:** imperative mood, ≤72 characters. Describes the change, not the motivation. "Add fractional indexing utility" — not "improve performance" or "update code."

**Body structure.** Non-trivial commits have a body separated from the subject by a blank line, wrapped at 72 characters. Use labeled sections where relevant. A template:

```
Add fractional indexing utility

Why: blocks need drag-to-reorder without renumbering siblings on
every insert. Integer positions don't support this cleanly.

Approach: wrap the `fractional-indexing` npm package in a thin
module under `src/lib/fractionalIndex.ts` so the rest of the
codebase doesn't import the library directly. Makes it swappable
later if needed.

Alternatives considered:
  - Hand-rolled base-36 string generation. Rejected: getting the
    edge cases right (inserts at extremes, ties) is non-trivial
    and the library is ~1kb.
  - Integer positions with periodic renumbering. Rejected per
    docs/04-decisions.md §009.

Follow-ups: integrate into block insertion (next commit) and
sidebar reorder handlers (separate commit).

See: docs/04-decisions.md §009, docs/03-data-model.md §Ordering.
```

Sections that may appear in a commit body:

- **Why** — the motivating problem or goal. Always present for non-trivial commits.
- **Approach** — the shape of the solution and any notable design choices inside it.
- **Alternatives considered** — options that were evaluated and rejected, with one-line reasons. Especially important for changes that look simple but had real trade-offs.
- **Follow-ups** — what this commit enables, blocks, or defers. Helps the next session pick up the right thread.
- **Watch out for** — non-obvious gotchas, fragile areas, test coverage gaps, things the diff can't show.
- **See** — links to relevant docs (always relative paths in the repo) or earlier commits (by SHA prefix).

Not every commit needs every section. A typo fix gets a one-line subject. A load-bearing change earns a full body. Use judgment; err toward more context on anything that touches the data model, a decision, or a cross-cutting concern.

**What commit messages are NOT for:**

- Duplicating the diff. Don't list the files you changed or restate what the code does. The diff shows that.
- Marketing language. No "improve," "enhance," "optimize" without specifics. Say what actually changed and why.
- Ticket references as substitutes for context. If a change was driven by a chat conversation or a NOTES.md entry, summarize the relevant point in the commit itself — future sessions may not have access to the chat.

**One logical change per commit.** If you can't summarize in one subject line without "and", split it. A commit body that needs to describe two unrelated changes is two commits.

**Every commit must leave the tree in a runnable state.** No half-broken intermediate commits. Tests pass; typecheck passes; build succeeds.

### Bad vs good examples

Bad:
```
updates
```

Bad:
```
fix stuff
```

Bad:
```
Refactor blocks module

Refactored blocks.ts to use the new pattern.
```
(Says nothing the diff doesn't show.)

Good:
```
Move block CRUD out of components into lib/blocks.ts

Why: BlockList.tsx was calling Supabase directly, which made it
impossible to unit-test without a database. The component now
calls into a thin lib module that can be mocked.

Approach: extracted createBlock, updateBlock, deleteBlock to
lib/blocks.ts. Kept the same call signatures so components
didn't need structural changes. Added unit tests for each.

Watch out for: optimistic updates (docs/04-decisions.md §013)
still live in the component — they need to move next, but that
involves state management choices I haven't made yet. Tracked
in docs/NOTES.md.

See: docs/05-conventions.md §File layout.
```

## Updating docs alongside code

Any commit that changes behavior visible in `docs/02-current-state.md` updates that doc in the same commit. Any commit that introduces or reverses a decision updates `docs/04-decisions.md` in the same commit. A stale doc is a bug.

## CHANGELOG.md

Maintain a `CHANGELOG.md` at the repo root. Every non-trivial commit adds a one-line entry under a dated heading. Format:

```
## 2026-04-20

- Add fractional indexing utility and integrate into block insertion. (abc123f)
- Update docs/03-data-model.md to reflect position field as TEXT.
```

One line per change, commit SHA in parentheses where relevant. Ordered newest-first.

Why: the CHANGELOG is the cheapest possible "what happened here" document. When a new AI session picks up the repo, reading the last week of CHANGELOG entries gives it more context faster than diffing commits.

## Session-end checklist

Before ending a working session (whether you push or not), the AI agent verifies:

1. `docs/02-current-state.md` accurately describes what's built. Update if not.
2. Any non-obvious decisions made in the session are logged in `docs/04-decisions.md` with today's date.
3. `CHANGELOG.md` has an entry for each commit made this session.
4. No dangling references in docs to files or symbols that were renamed/deleted.
5. Tests pass; typecheck passes; build succeeds.

Treat this as a hard rule, not a suggestion.

## Testing

- **Unit tests for `lib/`.** These should not need a browser or a database — pure logic.
- **Integration tests for persistence.** Use a test database or Supabase's local dev.
- **E2E tests are nice-to-have**, not required for the MVP.
- Tests live next to the code they test (`blocks.ts` ↔ `blocks.test.ts`).
