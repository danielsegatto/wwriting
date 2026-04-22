# 04 — Architectural Decisions

An append-only log. Each decision records what was chosen, what was rejected, and why.

**Rules for the AI agent:**
- Do not reverse decisions in this log without first asking the human.
- When you make a non-obvious new choice, append an entry in the same commit.
- Format: `## NNN — YYYY-MM-DD — Title` followed by Status, Decision, Rejected alternatives, Consequences. Number sequentially; include the date the decision was made.

---

## 001 — Block is the atomic unit, not the message

**Status:** accepted.
**Decision:** The fundamental entity is a Block — a first-class object with its own ID, addressable, taggable, referenceable, routable. Not a "message in a stream."
**Rejected:** A flat `messages` table where rows are only addressable by position within a conversation.
**Consequences:** Every Block has a UUID from creation. Cross-conversation references are possible. Moving a Block between Conversations is updating a single `conversation_id`. Retrofitting references onto a stream-based model would be painful, so this was decided up front.

## 002 — Citations export as Markdown links, not inlined content

**Status:** accepted.
**Decision:** `{{block:<uuid>}}` tokens export to Markdown links like `[preview text](https://app-url/b/<uuid>)`, not to inlined block content or blockquotes.
**Rejected:** Inlining the cited Block's body (would duplicate content, break on later edits). Blockquote rendering (ambiguous with user-written blockquotes).
**Consequences:** Exported Markdown is app-bound — the links require the app to resolve. The user accepted this trade-off because exports are for pasting elsewhere, not for producing standalone documents. If a self-contained export mode becomes necessary, add it as an export option; do not change the default.

## 003 — Topic divider is its own Block type

**Status:** accepted.
**Decision:** A divider is a row in `blocks` with `type='divider'`. Not metadata on an adjacent Block.
**Rejected:** `has_divider_before` boolean on the following Block (breaks when the block moves); separate `dividers` table (adds a second ordered list to merge on render).
**Consequences:** The `type` column exists from day one and is designed to be extensible. Future non-text Blocks (quote, image, embed) slot in without schema changes.

## 004 — Folders nest; Conversations do not

**Status:** accepted.
**Decision:** Folders form a self-referential tree. Conversations have a single `folder_id` and are tree leaves. Blocks live in exactly one Conversation.
**Rejected:** Unified nestable-everything model (overcomplicated UI; unclear what "a Block inside a Folder" would mean).
**Consequences:** Two kinds of things in the sidebar (Folders and Conversations) with visibly different behavior. Moving a Conversation updates `folder_id`; moving a Folder updates `parent_id`.

## 005 — Auth is email + password, not magic link

**Status:** accepted.
**Decision:** Classic email/password with email-based reset.
**Rejected:** Magic-link-only (user preference against it).
**Consequences:** Password reset flow required from day one. Email sending must be configured at project start, not deferred.

## 006 — Routing a Block is move, not copy

**Status:** accepted.
**Decision:** When a Block is routed to another Conversation, its `conversation_id` changes. No new row is created. The Block's ID is stable; citations continue to resolve.
**Rejected:** Copy semantics (would create divergent identical-looking Blocks, breaking backlinks and blurring identity).
**Consequences:** There is no "instance" concept. If the user wants a literal duplicate, they use a separate "Duplicate Block" action that produces a new Block with a new ID and no relationship to the original.

## 007 — Both explicit tag picker and inline `#hashtag`

**Status:** accepted.
**Decision:** Tags can be applied two ways: via a tag picker UI (writes `block_tags` rows with `source='picker'`) or via typing `#foo` in the body (writes rows with `source='inline'`, reconciled on each save).
**Rejected:** Picker-only (too slow during fast writing). Inline-only (parser edge cases, picker is still needed for discoverability).
**Consequences:** `block_tags` has a composite key including `source`. Deleting `#foo` from body removes the inline row; the picker row (if any) remains. A tag is "on" a Block if any row with any source exists. When the final `block_tags` row for a tag across all Blocks disappears, the tag itself is garbage-collected.

## 008 — Block previews are derived, not stored; full text, with collapse

**Status:** accepted.
**Decision:** Any place that shows a Block preview (citation pills, search results, pickers) shows the full body text. Long Blocks get a "tap to collapse" affordance.
**Rejected:** A stored `headline` column (speculative schema). Truncating previews by default (user preference against it).
**Consequences:** UI must handle variable-height preview rendering without layout jank. A threshold (e.g., 300 chars) determines when the collapse affordance appears; this threshold is UX, not a schema concern.

## 009 — Ordering via fractional indexing, not integer positions

**Status:** accepted.
**Decision:** `position` is a TEXT column using fractional-indexing-style strings. Reorders are a single UPDATE.
**Rejected:** Integer positions with renumbering on insert (slow, migration-prone, doesn't work well offline).
**Consequences:** A dependency on a fractional indexing library (or equivalent internal utility). The library's rules about generating positions between two values must be respected — do not hand-roll position strings.

## 010 — Markdown is canonical; storage format and export format are the same

**Status:** accepted.
**Decision:** `blocks.body` stores Markdown source as plain text, with two custom tokens (`{{block:<uuid>}}` and `#hashtag`). Rendering is a view concern. Export is the stored body with `{{block:<uuid>}}` tokens translated to Markdown links.
**Rejected:** HTML storage (harder to export cleanly). Rich AST storage (overkill for this use case, couples storage to editor). A proper structured document format (same reason).
**Consequences:** No rich-text toolbar that produces non-Markdown. The user writes Markdown syntax directly (`**bold**`), possibly aided by a keyboard shortcut toolbar on mobile.

## 011 — Single-user, always-online, last-write-wins sync

**Status:** accepted.
**Decision:** No conflict resolution UI. If two devices write concurrently, the last write wins silently. Supabase/Pocketbase realtime pushes updates to other connected clients.
**Rejected:** CRDTs, operational transform, merge UI — all massive engineering for a single-user app.
**Consequences:** The user may occasionally lose a trivial edit if they type on two devices simultaneously. Acceptable. Offline support is not a goal; see `docs/06-out-of-scope.md`.

## 012 — Desktop visual sophistication is a functional requirement

**Status:** accepted.
**Decision:** The desktop UI must appear elaborate and work-like to an onlooker. Theater-layer features (command palette, graph view, tag cloud, ambient status bar, dense information display) are Phase 3 deliverables, not polish.
**Rejected:** Treating theatrics as nice-to-have. Mobile-mirror-on-desktop.
**Consequences:** The desktop UI diverges significantly from the mobile UI. Desktop can show more at once, more chrome, more indicators. Mobile stays ruthlessly minimal. Features that look impressive but are shallow (e.g., a busy status bar) are acceptable — the goal is visual impression, not depth of function. This must never compromise writing-loop friction (Goal 1).

## 013 — Optimistic client-side state for send/edit

**Status:** accepted.
**Decision:** On send/edit, update the UI immediately with a locally-generated UUID and queue the write. Show a subtle indicator on blocks that haven't been acknowledged by the server. Retry with backoff on failure; surface a manual retry if the final attempt fails.
**Rejected:** Waiting for server round-trip before displaying the Block (unacceptable latency on the hot path).
**Consequences:** Client must handle a small state machine per Block: `synced | syncing | failed | editing | dragging`. This is client state only; never persisted.

## 014 — 2026-04-20 — Error handling must be visible in the app, not the console

**Status:** accepted.
**Decision:** All runtime errors surface inside the app UI — a persistent event log panel, a status-bar indicator, and a top banner for errors. `window.error` and `window.unhandledrejection` route into the same log. Every caught error inside application code calls a central `report(severity, message, details)` function rather than `console.error`.
**Rejected:** Console-only logging (the human often works in environments without devtools access, including chat-based artifact renderers). Silent failure with a generic "something went wrong" toast (hides diagnostic information needed to fix the problem).
**Consequences:**
- The UI has a permanent event log affordance at the bottom of the screen. This is not optional chrome; it is a functional requirement.
- Every `try/catch` in application code must route the catch through the reporter, not silently swallow or only log to console.
- The API surface for reporting is `report(severity, message, details?)` where severity is `'error' | 'warn' | 'info'`.
- The log retains up to 200 entries, FIFO. Persisting across reloads is not required in MVP but is a reasonable Phase 2 addition if diagnosis of pre-reload errors becomes useful.
- This principle dovetails with Goal 2 (desktop visual sophistication): a developer-console-style log reinforces the "serious tool" impression. The functional requirement is primary; the aesthetic benefit is a bonus.

## 015 — 2026-04-20 — Commit messages are durable context for future AI sessions

**Status:** accepted.
**Decision:** Commit messages in this repo are written primarily for a future AI session that will read `git log` to orient itself. A non-trivial commit message has a body that explains *why* the change happened, *what alternatives were considered*, and *what follow-ups it enables or blocks* — not just *what* changed, which the diff already shows. The specific template and rules live in `docs/05-conventions.md` §Git conventions.
**Rejected:**
- *Minimal conventional commits* (subject line only, "feat: add X"). Rejected because they lose the reasoning that makes a commit useful as context weeks later.
- *Offloading all context to `docs/04-decisions.md`*. Rejected because decisions capture high-level architectural choices; commit-level reasoning (why this approach, what was tried, what to watch for in adjacent code) is too granular for the decisions log but too valuable to lose.
- *Requiring full-body commits for every change*. Rejected as busywork. Trivial changes get short messages; load-bearing changes earn bodies.
**Consequences:**
- Commit authors spend more time writing each non-trivial commit. This is a deliberate cost trade-off for future legibility.
- `CLAUDE.md` and `docs/09-session-handoff.md` instruct AI sessions to read recent commit bodies (not just `--oneline`) as part of orientation. Commit bodies are first-class context, alongside the docs and CHANGELOG.
- The CHANGELOG remains the one-line high-level view; commit bodies are the detailed view. They complement, not duplicate.
- When a commit body would contradict a doc, the doc is updated in the same commit and the body notes the divergence. Commits and docs must not drift apart.
- Because commit history is append-only (no rewriting published history), the investment compounds. Every load-bearing commit adds to the corpus of context future sessions can draw on.

## 016 — 2026-04-20 — React + Vite + Tailwind v4 as the frontend stack

**Status:** accepted.
**Decision:** React 19 with TypeScript strict mode, Vite 8 as the build tool, Tailwind CSS v4 (CSS-first, `@tailwindcss/vite` plugin — no `tailwind.config.js`).
**Rejected:**
- Svelte: rejected (human chose React).
- Solid: rejected (human chose React).
- Tailwind v3: rejected in favour of v4 (human chose v4; v4's CSS-first config is simpler and integrates cleanly with the Vite plugin).
- webpack / other bundlers: Vite is the obvious choice for a Vite-era React project; no serious alternative was considered.
**Consequences:**
- Tailwind v4 uses `@import "tailwindcss"` in the CSS entrypoint rather than a JS config file. Utility classes are available everywhere without additional configuration.
- The `@tailwindcss/vite` plugin must remain in `vite.config.ts`; removing it silently drops all utility styles.
- React 19 is the current major; watch for breaking changes if upgrading minor versions.
- Bundle size baseline: ~192 kB JS (React + ReactDOM, pre-tree-shaking of actual app code), ~8.5 kB CSS.

## 017 — 2026-04-20 — Supabase as the backend

**Status:** accepted.
**Decision:** Supabase (hosted Postgres + auth + realtime) over Pocketbase.
**Rejected:**
- Pocketbase: rejected (human chose Supabase). Pocketbase is a single Go binary with simpler ops but a smaller JS ecosystem and no managed hosting out of the box.
**Consequences:**
- `@supabase/supabase-js` is a runtime dependency. It is not included in the bundle until something actually imports `src/lib/supabase.ts`.
- All tables carry a denormalized `user_id` column so RLS policies are single-clause (`user_id = auth.uid()`). `block_tags` and `block_references` lack `user_id` and use subquery-based RLS through the parent `blocks` row.
- DB types (`src/db/types.ts`) are hand-written for MVP speed. Regenerate with `npx supabase gen types typescript --project-id <id>` after the project is created; the hand-written file is a faithful starting point but the generated file is the authority once the project exists.
- The migration file (`src/db/migrations/001_initial_schema.sql`) is idempotent and safe to re-run. It does not use the Supabase CLI migration system, so there is no migration tracking table. If the CLI is adopted later, this file becomes migration 0001.
- Realtime is enabled for `folders`, `conversations`, and `blocks` via `supabase_realtime` publication. `tags`, `block_tags`, `block_references`, and `user_settings` are not in the publication; they do not require realtime in the MVP.

## 019 — 2026-04-22 — Composer-first build order; position as timestamp string

**Status:** accepted.
**Decision:** Build the Composer (write path) before the block list, sidebar, or full data-access layer. Use `Date.now().toString()` as the `position` value for new Blocks.
**Rejected:**
- Data-access-layer-first: would delay the writing loop. The Composer only needs `createBlock`, `findOrCreateTag`, and `attachTagsToBlock`.
- Fractional indexing from day one: premature until drag-to-reorder is built. `Date.now().toString()` sorts lexicographically and is correct for append-only creation.
- App-shell-first: no writing happens until the Composer is wired.
**Consequences:**
- `src/lib/blocks.ts`, `src/lib/tags.ts`, `src/lib/conversations.ts` exist as thin Supabase wrappers. Full CRUD (list, update, delete) is not yet present.
- `ensureDefaultConversation` in `src/lib/conversations.ts` bootstraps a "Journal / My Notes" folder+conversation on first login. This is a one-time bootstrap helper, not a user-facing concept.
- `AuthGate` now takes a render-prop `children: (session: Session) => ReactNode` so `App.tsx` can access the session without a second auth listener.
- `src/db/types.ts` was updated to add `Relationships: []` to each table and `Views`/`Functions` to the public schema — required by `@supabase/postgrest-js` 2.104 which changed `GenericTable` and `GenericSchema` to require these fields.
- `position` values will need to be migrated to proper fractional indices if drag-to-reorder is implemented. This is expected. The existing rows will sort by creation time which is correct.

## 018 — 2026-04-20 — Supabase hosted Auth UI over custom forms

**Status:** accepted.
**Decision:** Use `@supabase/auth-ui-react` (`<Auth>` component with `ThemeSupa`) rather than hand-rolling login/signup/reset forms.
**Rejected:**
- Custom React forms: rejected (human chose hosted UI). Would give full styling control at the cost of building and maintaining form validation, error messages, password reset flow, and PKCE handling.
**Consequences:**
- `@supabase/auth-ui-react` and `@supabase/auth-ui-shared` are runtime dependencies (~250 kB uncompressed, ~130 kB gzipped including Supabase SDK).
- The `<Auth>` component is configured with `providers={[]}` (no OAuth) and `view="sign_in"` as the default. The "Forgot Password?" and "Don't have an account?" links are shown via `showLinks`.
- Styling is driven by the `ThemeSupa` theme with `variables` overrides to match the zinc dark palette — not Tailwind utilities, since the component renders its own CSS custom properties.
- If the auth UI needs to diverge from what `@supabase/auth-ui-react` supports, the package must be replaced with custom forms. Do not patch the package internals.
- The loading state (session check in-flight) renders a blank dark screen to avoid flashing the auth form before redirecting an already-authenticated user.

## 020 — 2026-04-22 — Sidebar owns its own data fetch; two-effect pattern in AppShell

**Status:** accepted.
**Decision:** The `Sidebar` component fetches its own `folders` and `conversations` lists on mount via `Promise.all([listFolders, listConversations])`. `AppShell` does not pass these lists down. `AppShell` has two separate `useEffect`s: one that bootstraps the default conversation (depends on `userId`), and one that reloads blocks (depends on `conversationId`).
**Rejected:**
- Single monolithic `useEffect` in `AppShell` that fetches folders + conversations + blocks together: couples bootstrap logic to render-time data loading and makes it hard to reload blocks independently on conversation switch.
- Passing folders and conversations from `AppShell` into `Sidebar` as props: adds unnecessary data-flow complexity; the Sidebar is the only consumer and it needs fresh data on mount regardless.
**Consequences:**
- When the user selects a conversation in the Sidebar, `AppShell` sets `conversationId`, triggering the second effect which clears blocks and reloads for the new conversation.
- The `ensureDefaultConversation` bootstrap effect only sets `conversationId` on first load; the Sidebar independently fetches the folder/conversation list, so it will reflect the bootstrapped conversation automatically.
- If Sidebar ever needs to reflect real-time changes, it should subscribe inside the component, not re-fetch on every parent render.
