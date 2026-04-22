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
- Because commit history is append-only (no rewriting published history), the investment compounds.

## 028 — 2026-04-22 — Sidebar drag uses pointer events, scoped within-folder for conversations

**Status:** accepted.
**Decision:** Drag-to-reorder in the sidebar uses pointer events with `setPointerCapture` — the same pattern as BlockFeed block reordering. A `GripIcon` handle on each folder row and conversation row initiates the drag. Folders can be reordered among themselves. Conversations can be reordered within their containing folder only; cross-folder move remains a picker operation (no change). Positions are persisted via `reorderFolders` / `reorderConversations` bulk upserts, mirroring `reorderBlocks`.
**Rejected:**
- HTML5 Drag and Drop API: rejected because it does not fire on touch events (iOS Safari), and the app is mobile-first.
- Cross-folder conversation drag: rejected as out of scope for this slice — the existing Block move picker already covers it and adding drop zones on folder rows would add significant complexity.
- A new drag library (react-dnd, dnd-kit, etc.): rejected per `docs/07-ask-first.md` (requires human approval for new dependencies); pointer events with capture are sufficient for a sidebar list.
**Consequences:**
- `reorderFolders` and `reorderConversations` added to `src/lib/folders.ts` and `src/lib/conversations.ts` respectively. Both import `createSequentialPositions` from `src/lib/blocks.ts`.
- Drag state tracks a `preview` array that becomes the live display order during the drag. On drop, the preview is committed to local state and the DB write fires asynchronously.
- `data-drag-folder` and `data-drag-conv-scope` attributes on row elements allow `getDropIndex` to query the DOM for item midpoints, filtered by `data-drag-id` to exclude the active item from drop-target calculation. Every load-bearing commit adds to the corpus of context future sessions can draw on.

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
- `src/lib/blocks.ts`, `src/lib/tags.ts`, `src/lib/conversations.ts` exist as thin Supabase wrappers. Conversation helpers now cover bootstrap/list/create/delete; broader CRUD is still intentionally incomplete.
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

## 021 — 2026-04-22 — Inline creation UI in sidebar; no modal

**Status:** accepted.
**Decision:** Creating a folder or conversation is done via an inline `<input>` that appears in the sidebar tree at the point of creation (below existing folders for new folders; below conversations in the target folder for new conversations). Enter confirms; Escape or blur cancels. Empty input is a no-op.
**Rejected:**
- Modal dialog: breaks the writing flow; requires portal management and focus trapping; adds visual weight for a frequent operation.
- Navigation to a dedicated "new folder" page: overkill for a single-user tool.
- Separate name-input field always visible at the bottom: wastes sidebar space; the operation is infrequent enough that it should be triggered, not permanent.
**Consequences:**
- The `InlineInput` component autofocuses on mount via `useEffect` + `ref`.
- `onBlur` cancels creation. This means that if the user clicks a folder's "new conversation" button while another inline input is active, the first blur fires first, cancelling the previous creation — which is the correct behavior.
- After creating a conversation, the Sidebar calls `onSelectConversation` with the new ID, so `AppShell` auto-navigates to it.
- Creating a folder with a collapsed target folder auto-expands it so the new conversation input is visible.
- No optimistic UI beyond local state — the row only appears after the DB insert succeeds.

## 022 — 2026-04-22 — Tag picker lives on each Block, not in the Composer

**Status:** accepted.
**Decision:** Explicit Tag assignment via the picker is attached to each text Block in the feed, opened from a lightweight local control on the Block itself. The Composer remains focused on send-only writing; inline `#hashtag` remains the fast-path tagging workflow during composition.
**Rejected:**
- Composer-level tag controls: rejected because they add friction and visual weight to the hot writing path, which violates Goal 1.
- Modal or route-based tag management: rejected because the operation is lightweight and should stay close to the Block being tagged.
- Divider tagging: rejected because divider Blocks are structural markers, not content Blocks.
**Consequences:**
- The feed owns enough block metadata UI to display applied Tag pills and open a small picker for text Blocks.
- Picker-applied tags write `block_tags` rows with `source='picker'`; removing a picker Tag only deletes that provenance row and must not affect inline tags derived from `body`.
- A visible Tag pill is the union of picker and inline sources. If both exist for the same Tag, removing the picker source leaves the pill visible.

## 023 — 2026-04-22 — Block management lives in feed-local action menus; move ships as picker first

**Status:** accepted.
**Decision:** Block editing, moving, and deletion are exposed from a feed-local actions menu on each Block. The menu is always discoverable through a visible action button, with `double-click` on desktop and `long-press` on touch as shortcuts to the same controls. Move ships first as a destination Conversation picker inside the Block card; drag-to-sidebar is deferred. Inline editing applies only to text Blocks in this slice; divider Blocks support move/delete but not inline edit.
**Rejected:**
- Gesture-only discovery: rejected because it hides load-bearing block actions behind behavior the user might never discover, especially on mobile.
- Modal edit / move flows: rejected because they add visual weight and distance the action from the Block being changed.
- Bundling drag-to-sidebar into the same slice: rejected because the sidebar/feed do not yet have drag infrastructure, and the picker path covers the core move behavior without delaying the rest of block management.
- Editing divider Blocks now: rejected because divider editing semantics are less important than shipping the text-block editing loop and would complicate this slice for little value.
**Consequences:**
- `src/components/feed/BlockFeed.tsx` now owns action-menu state, edit state, and move/delete confirmation state for the active Block rather than lifting these controls into `AppShell`.
- `src/lib/blocks.ts` expands from create/list helpers into CRUD-style helpers for update, delete, and move.
- Inline hashtag reconciliation can no longer live only in the Composer; `src/lib/tags.ts` owns reusable extract/ensure/reconcile helpers so edits and creates follow the same rules.
- The source conversation updates immediately after move/delete by removing the Block from local feed state; destination conversations pick the Block up on reload/navigation.
- Drag-to-sidebar remains a separate follow-up feature. Do not treat this decision as having completed the drag half of the original backlog item.

## 024 — 2026-04-22 — Conversation export lives in the header and preserves Markdown source

**Status:** accepted.
**Decision:** Exporting the current Conversation is exposed as two header actions in `AppShell`: copy as Markdown and download as `.md`. The exported text begins with an H1 title using the Conversation name, preserves text Block bodies as Markdown source, emits divider Blocks as literal `---`, converts `{{block:<uuid>}}` tokens into Markdown links to `/b/<uuid>`, and renders missing targets as `[deleted]`.
**Rejected:**
- Sidebar- or menu-only export: rejected because export is part of the core writing/backup loop and should stay one click away from the active Conversation.
- HTML export: rejected because `docs/04-decisions.md` §010 already makes Markdown canonical for storage and export.
- Prototype-style labeled divider export: rejected for the real app because the current implementation treats divider Blocks as plain divider markers rather than named section headers.
**Consequences:**
- `src/lib/conversationMarkdown.ts` owns the pure export formatter and filename helper so the export rules are unit-testable outside the browser.
- `src/app/App.tsx` loads citation targets only when the user exports, keeping the compose/render path unchanged.
- Copy and download share the same formatter, so clipboard export and file export stay byte-for-byte aligned.

## 025 — 2026-04-22 — Supabase browser config is build-time deploy config, not runtime config

**Status:** accepted.
**Decision:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are treated as required Vite build-time inputs for both local and deployed builds. GitHub Pages deploys must inject them through the GitHub Actions workflow, and the workflow should fail before publishing if they are absent.
**Rejected:**
- Expecting a static GitHub Pages site to read `.env.local` or any other environment file at runtime: rejected because Vite inlines `import.meta.env.*` during the build, and the browser only receives the compiled bundle.
- Allowing deploys to succeed with missing values and relying on the runtime error reporter to explain the failure: rejected because it publishes a known-broken bundle and pushes a deployment-configuration mistake into the user's browser.
**Consequences:**
- `.github/workflows/deploy.yml` validates `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` before `npm run build` and passes them into the build step from GitHub repository secrets.
- `src/lib/supabase.ts` throws one explicit startup error when config is absent, avoiding the less helpful downstream `supabaseUrl is required` exception from the SDK.
- Deployment docs must mention the GitHub-side secret setup, not only `.env.local`.

## 027 — 2026-04-22 — Realtime via postgres_changes in component effects; no shared subscription manager

**Status:** accepted.
**Decision:** Realtime subscriptions are set up directly inside `useEffect` hooks in the two components that own the relevant state: `AppShell` (one channel for `blocks` filtered by `conversation_id`) and `Sidebar` (one channel for both `folders` and `conversations` filtered by `user_id`). Each effect returns a cleanup that calls `supabase.removeChannel`. INSERT events are deduplicated by ID before being applied to state; UPDATE events replace the matching row; DELETE events filter it out.
**Rejected:**
- A shared subscription manager or context: rejected as over-engineering for a single-user app with two subscription sites and no shared state between them.
- Refetching the full list on every realtime event: rejected because it adds a round-trip per event and would cause visible jank for remote inserts.
- Subscribing to all tables globally and filtering in-memory: rejected because Supabase charges message volume against the free tier; server-side `filter:` cuts noise at the source.
**Consequences:**
- Changing `conversationId` tears down the old block channel and opens a new one (effect dependency array). The brief window during conversation switch where realtime is not active is acceptable.
- INSERT deduplication is critical: this device writes a block locally via `handleBlockCreated`, then the same block arrives via realtime. The `prev.some((b) => b.id === block.id)` guard prevents a duplicate.
- Remote INSERT blocks are sorted into position order rather than appended to the end, so they appear at the correct visual position regardless of the receiving device's clock offset.
- `CHANNEL_ERROR` status routes through the error reporter as a warning, which is visible in the in-app event log per §014.

## 026 — 2026-04-22 — PWA via vite-plugin-pwa; autoUpdate; Supabase traffic excluded from SW cache

**Status:** accepted.
**Decision:** Use `vite-plugin-pwa` in `generateSW` mode with `registerType: 'autoUpdate'`. The service worker precaches the built app shell (HTML, JS, CSS) for fast subsequent loads and installability. All traffic to `*.supabase.co` is routed `NetworkOnly` — never cached. Icons (`pwa-192x192.png`, `pwa-512x512.png`, `apple-touch-icon.png`) are pre-generated from `public/favicon.svg` using `scripts/gen-icons.mjs` and committed; they are not regenerated at build time.
**Rejected:**
- Offline support: explicitly out of scope per `docs/06-out-of-scope.md` and `docs/04-decisions.md` §011. The SW is for installability and startup speed, not offline writes.
- Caching Supabase traffic: rejected because auth tokens and API responses are user-specific, session-bound, and must not be served stale. A cached auth response could mask a session expiry.
- `registerType: 'prompt'`: rejected because there is only one user — a silent auto-update is always correct and eliminates the "waiting" service worker state.
- Generating icons at build time (e.g., via `@vite-pwa/assets-generator`): rejected because it adds a build-time SVG rasterization dependency and extra CI configuration. Pre-generating once and committing the PNGs is simpler and stable.
- Using SVG directly as the manifest icon: rejected because iOS Safari requires PNG for apple-touch-icon, and SVG manifest icons are not supported on all platforms.
**Consequences:**
- `vite-plugin-pwa@1.2.0` installed with `--legacy-peer-deps` because the package's peer dep declaration caps at Vite 7; the plugin works correctly with Vite 8 in practice.
- `start_url` and `scope` in the manifest must match the production base path (`/wwriting/`); the vite config reads `command` at definition time and sets these conditionally.
- `scripts/gen-icons.mjs` documents the icon regeneration procedure. If `favicon.svg` changes, re-run the script and commit the updated PNGs.
- The build emits `dist/sw.js`, `dist/workbox-*.js`, and `dist/manifest.webmanifest`. The deploy workflow picks these up automatically since it publishes all of `dist/`.

## 028 — 2026-04-22 — Optimistic send uses client-only pending rows; block actions wait for ack

**Status:** accepted.
**Decision:** Optimistic state for sending is implemented with client-only temporary Blocks that are appended to the feed immediately, then replaced with the persisted row after Supabase acknowledges the insert. While a Block is still `syncing` or has reached `failed`, feed-local actions stay disabled; the failed state surfaces an inline retry button on the Block card.
**Rejected:**
- Waiting for the insert round-trip before showing the Block: rejected per §013 because it makes the hot writing path feel laggy.
- Letting pending Blocks participate fully in edit, move, delete, drag, tag, and citation-target flows: rejected because the rest of the feed currently assumes a stable persisted Block ID and server-backed metadata rows.
- Hiding failed sends by removing the temporary Block: rejected because it loses the user's text at exactly the moment they most need reassurance and recovery.
**Consequences:**
- `src/lib/blocks.ts` now defines a client-only `syncStatus` / `syncErrorMessage` layer on top of persisted Block rows. This state must never be written to the database.
- `src/app/App.tsx` owns the send retry loop and the swap from `local:<uuid>` temporary IDs to real database IDs, rather than leaving send persistence inside the Composer.
- `src/components/feed/BlockFeed.tsx` must ignore non-synced Blocks when loading tag metadata and citation targets, because those helpers depend on persisted Block IDs.
- The current optimistic scope covers send only. Edit remains server-round-trip-first even though §013 mentions send/edit; if optimistic edit is added later, it should build on the same client-only status model instead of inventing a second one.

## 029 — 2026-04-22 — Error UI ships as banner plus bottom status strip with expandable log

**Status:** accepted.
**Decision:** The visible error-reporting UI lives in a dedicated `ErrorConsole` component mounted in `AppShell`. It always renders a bottom status strip as the permanent event-log affordance, expands into a scrollable console panel on demand, and shows a top in-shell banner only for unread `error` entries. Opening the log marks current entries read; warnings and info entries remain visible in the log without triggering the top banner.
**Rejected:**
- Keeping the reporter headless until a later polish pass: rejected because §014 makes visible error handling a current functional requirement, not future chrome.
- A modal-only log viewer: rejected because it hides the state of the system until the user intentionally opens a separate layer and weakens the "always visible" affordance required by §014.
- Bannering warnings and info events the same way as errors: rejected because it would turn normal operational chatter into constant interruption and make real failures easier to ignore.
**Consequences:**
- `src/components/system/ErrorConsole.tsx` owns the reporter subscription, unread/read transitions, detail formatting, and clear-log controls; `src/app/App.tsx` only mounts it.
- The app now has three distinct severity surfaces: unread errors appear in the top banner, all severities contribute to the bottom status strip counts, and full details live in the expandable event log.
- The reporter store remains in-memory only. Reloading the page clears read state and prior entries; persistent diagnostics remain a possible later follow-up, not part of this slice.

## 030 — 2026-04-22 — Header search ships as grouped `ilike` search before any schema migration

**Status:** accepted.
**Decision:** The first search slice lives in the `AppShell` header as one search field with grouped results for Folders, Conversations, and text Blocks. The implementation uses existing-table `ilike` queries from `src/lib/search.ts` rather than a new `tsvector` column/index migration. Selecting a Block result reuses the existing jump/highlight flow; selecting a Conversation opens it directly; selecting a Folder opens its first Conversation, or reopens the sidebar if the Folder is empty.
**Rejected:**
- Waiting for the eventual Phase 2 `tsvector` migration before shipping any search UI: rejected because search is already a product promise and `docs/07-ask-first.md` requires human approval before schema/index changes.
- Separate search surfaces for folders, conversations, and blocks: rejected because it adds friction to the hot path and makes search feel like administration instead of recall.
- A command-palette-only search entry point: rejected because command palette is explicitly Phase 3 theater-layer work, while search is a Phase 2 functional requirement.
**Consequences:**
- Search quality is substring-based for now. It will miss stemming/tokenization cases that a real full-text index would catch, but it works immediately on the current schema.
- `src/app/App.tsx` now owns search query state, grouped-result overlay UI, and selection handling, while `src/lib/search.ts` owns the Supabase queries and result shaping.
- Folder results need a deterministic navigation target because the main pane renders Conversations, not Folders. The "first Conversation in the Folder, otherwise open the sidebar" rule is now part of the product behavior unless revisited later.
