
# 02 — Current State

**Keep this file up to date. If you change what's built, update this file in the same commit.**

## Overall phase

**Phase 0 — initial implementation.** Design is settled; the real application has started under `src/` with framework-neutral foundation code. A functional prototype exists outside the production source tree (single-file HTML artifact) and will serve as the reference implementation for the first proper build.

## Built

- Project scaffold: React 19 + Vite 8 + Tailwind CSS v4. `npm run build` passes. Stack decision in `docs/04-decisions.md` §016.
- Auth gate (`src/app/AuthGate.tsx`) — session check on mount via `supabase.auth.getSession`, live updates via `onAuthStateChange`. Unauthenticated users see the `<Auth>` component (email/password + forgot-password, no OAuth). Authenticated users see the app. Loading state renders a blank dark screen (no flash of auth UI).
- `src/lib/auth.ts` — `signOut()` helper; routes errors through the reporter.
- Supabase client (`src/lib/supabase.ts`) — typed singleton using `@supabase/supabase-js`. Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Vite build environment; missing values now produce one explicit app error and abort startup before the lower-level Supabase SDK crash. Local dev uses `.env.local`; GitHub Pages deploys inject the same names from GitHub Actions secrets.
- DB schema (`src/db/migrations/001_initial_schema.sql`) — all tables, indexes, `updated_at` triggers, and RLS policies matching `docs/03-data-model.md`. Run once in the Supabase SQL editor.
- DB types (`src/db/types.ts`) — hand-written `Database` type for Supabase client inference. Regenerate with `npx supabase gen types typescript` after running migrations.
- `src/lib/errors.ts` centralizes visible runtime reporting with `report('error' | 'warn' | 'info', ...)`, FIFO retention, subscribers for future UI, console mirroring, and one-time global `error` / `unhandledrejection` handlers. Activated at startup via `installGlobalErrorHandlers(window)` in `src/main.tsx`.
- Block management in `src/components/feed/BlockFeed.tsx` — each Block has a local actions menu with a visible action button plus `double-click` / touch `long-press` shortcuts. Text Blocks can be edited inline with explicit save/cancel; any edit re-runs inline `#hashtag` reconciliation through `src/lib/tags.ts`. Text and divider Blocks can be dragged to reorder within the current Conversation, moved to another Conversation via a picker, or deleted via inline confirmation. Blocks can also be multi-selected for bulk move/delete actions. Drag-to-sidebar and orphan-citation UI are still deferred.
- Citations are live across the MVP writing loop. Typing `@` in `src/components/composer/Composer.tsx` at the start of input or after whitespace opens a citation picker over existing text Blocks, inserting raw `{{block:<uuid>}}` tokens into the body. `src/lib/references.ts` reconciles `block_references` on create/edit, and `src/lib/markdown.ts` renders citation pills in `src/components/feed/BlockFeed.tsx`. Clicking a citation pill jumps to the target Block, switching Conversations when needed and temporarily highlighting the destination Block. Missing targets render as `[deleted]`.
- Tagging now has two authoring paths. Inline `#hashtag` text still reconciles on save, and the composer now opens a live tag picker while typing `#` so existing Tags can be inserted quickly or new Tags can be created from the current token before the Block is sent.
- Conversation export is live from the main header in `src/app/App.tsx`. The current Conversation can be copied to the clipboard or downloaded as Markdown; export prepends an `# H1` title, emits divider Blocks as literal `---`, translates `{{block:<uuid>}}` tokens into Markdown links to `/b/<uuid>`, and leaves missing targets as `[deleted]`. Formatting lives in `src/lib/conversationMarkdown.ts` with unit tests.

## Reference prototype

A functional prototype lives at `prototype/writing-app.html`. It is a single self-contained HTML file that implements most of the MVP feature list using `window.storage` for persistence. It is a working specification, not the codebase.

When building the real thing under `src/`:

- Re-implement, do not copy. The prototype uses shortcuts (vanilla JS, inline styles, no build, no auth, no sync) that are not acceptable for the real build. Its value is behavioral reference, not source material.
- Behavior of the prototype is the source of truth for UX questions where docs are ambiguous. Open `prototype/writing-app.html` in a browser to interact with it.
- The prototype will remain in the repo after `src/` is populated, as a reference point. Do not delete it without human approval.

## Planned — MVP

- [x] Project scaffold (React 19, Vite 8, Tailwind v4 — see §016)
- [x] Supabase setup: client in `src/lib/supabase.ts`, typed via `src/db/types.ts`, migration at `src/db/migrations/001_initial_schema.sql` (see §017)
- [x] Auth: `@supabase/auth-ui-react` `<Auth>` component gated behind `src/app/AuthGate.tsx`; email/password + forgot-password flow; `signOut()` helper in `src/lib/auth.ts` (see §018)
- [x] Data model (migrations for folders, conversations, blocks, tags, block_tags, block_references, user_settings) — see §017
- [x] Composer (`src/components/composer/Composer.tsx`): send on Enter, Shift+Enter newline, divider detection, inline #hashtag parsing → `block_tags` rows, plus live `#` tag suggestions/create flow while writing (see §019)
- [x] Sidebar tree (folders nestable, conversations as leaves): `src/components/sidebar/Sidebar.tsx` — collapsible folders, conversation leaves, click-to-select. Data-fetching owned by the Sidebar itself (see §020).
- [x] Block rendering (`src/components/feed/BlockFeed.tsx`): renders `text` blocks as Markdown (via `marked`), `divider` blocks as `<hr>`. Optimistic append on send; loads full history on mount via `listBlocks()`.
- [x] Topic divider Blocks (send `---` → `type='divider'` — done in Composer, see §019)
- [x] Inline `#hashtag` parsing → `block_tags` rows (done in Composer, see §019)
- [x] Create Folder / Conversation from sidebar: inline input in sidebar tree; Enter confirms, Escape/blur cancels; auto-navigate on conversation creation (see §021).
- [x] Delete Folder / Conversation from sidebar: delete controls live in the sidebar tree; deleting a Folder cascades to its child Conversations via the existing foreign keys; if the selected Conversation is deleted, selection falls back to another Conversation or clears when none remain.
- [x] Delete confirmation: deleting a Folder or Conversation requires a browser confirmation prompt before the destructive action runs.
- [x] Tag picker UI: block-level picker in `src/components/feed/BlockFeed.tsx`; applied tags render as pills below text Blocks, picker tags can be added/removed without touching inline `#hashtag` rows (see §022)
- [x] Citation picker (`@` in composer → Block picker → insert `{{block:<uuid>}}`)
- [x] Clickable citation pills (navigate + highlight target)
- [x] Drag-to-reorder Blocks within Conversation
- [ ] Drag-to-reorder sidebar tree
- [x] Move Block to another Conversation (picker in Block actions menu; drag-to-sidebar still deferred)
- [x] Edit Block (visible action button plus double-click / long-press shortcut; text Blocks only)
- [x] Delete Block (inline confirmation in Block actions menu; orphan-citation UI still deferred)
- [x] Multi-select Blocks for bulk move/delete
- [x] Export Conversation as Markdown (download + copy)
- [ ] Export full workspace as zip of `.md` files
- [x] Realtime sync: `postgres_changes` subscriptions in `AppShell` (blocks for the active conversation) and `Sidebar` (folders + conversations). INSERT/UPDATE/DELETE handled with deduplication; Supabase free tier covers single-user traffic easily.
- [ ] Optimistic local state on send
- [x] PWA manifest + service worker (installable on iOS via `vite-plugin-pwa`; icons at `public/pwa-{192,512}x{192,512}.png` + `public/apple-touch-icon.png`; SW caches app shell, never caches `*.supabase.co`)

## Planned — Phase 2 (connective tissue)

- [ ] Full-text search across Blocks, Conversations, Folders
- [ ] Filter by tag
- [ ] Backlinks view for a Block
- [ ] Clickable `/b/<uuid>` URLs that resolve to Blocks

## Planned — Phase 3 (theater layer, desktop only)

See `docs/01-purpose.md` §"Goal 2" for why this is not optional polish. Features in this list are defined by visual sophistication, not necessarily by deep function.

- [ ] Command palette (⌘K)
- [ ] Conversation graph view
- [ ] Tag cloud
- [ ] Visible keyboard shortcut hints
- [ ] Ambient status bar with activity indicators
- [ ] Dense information display on desktop (compared to mobile)

## Known issues

_None yet. Log issues here as they are discovered, with date and commit SHA where relevant._

## Deferred intentionally

See `docs/06-out-of-scope.md` for things that look like they belong on this list but are deliberately excluded.
