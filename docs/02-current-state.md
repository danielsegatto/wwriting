
# 02 — Current State

**Keep this file up to date. If you change what's built, update this file in the same commit.**

## Overall phase

**Phase 0 — initial implementation.** Design is settled; the real application has started under `src/` with framework-neutral foundation code. A functional prototype exists outside the production source tree (single-file HTML artifact) and will serve as the reference implementation for the first proper build.

## Built

- `src/lib/errors.ts` centralizes visible runtime reporting with `report('error' | 'warn' | 'info', ...)`, FIFO retention, subscribers for future UI, console mirroring, and one-time global `error` / `unhandledrejection` handlers.

## Reference prototype

A functional prototype lives at `prototype/writing-app.html`. It is a single self-contained HTML file that implements most of the MVP feature list using `window.storage` for persistence. It is a working specification, not the codebase.

When building the real thing under `src/`:

- Re-implement, do not copy. The prototype uses shortcuts (vanilla JS, inline styles, no build, no auth, no sync) that are not acceptable for the real build. Its value is behavioral reference, not source material.
- Behavior of the prototype is the source of truth for UX questions where docs are ambiguous. Open `prototype/writing-app.html` in a browser to interact with it.
- The prototype will remain in the repo after `src/` is populated, as a reference point. Do not delete it without human approval.

## Planned — MVP

- [ ] Project scaffold (PWA, framework choice, build tooling)
- [ ] Supabase or Pocketbase setup
- [ ] Email/password auth with password reset
- [ ] Data model (migrations for folders, conversations, blocks, tags, block_tags, block_references, user_settings)
- [ ] Composer (send on Enter, Shift+Enter newline, type=text Blocks)
- [ ] Sidebar tree (folders nestable, conversations as leaves)
- [ ] Block rendering (Markdown + custom tokens)
- [ ] Topic divider Blocks (send `---`, labeled)
- [ ] Inline `#hashtag` parsing → `block_tags` rows
- [ ] Tag picker UI (explicit tag assignment)
- [ ] Citation picker (`@` in composer → Block picker → insert `{{block:<uuid>}}`)
- [ ] Clickable citation pills (navigate + highlight target)
- [ ] Drag-to-reorder Blocks within Conversation
- [ ] Drag-to-reorder sidebar tree
- [ ] Move Block to another Conversation (picker + drag-to-sidebar)
- [ ] Edit Block (double-click / long-press)
- [ ] Delete Block (with orphan citation handling)
- [ ] Export Conversation as Markdown (download + copy)
- [ ] Export full workspace as zip of `.md` files
- [ ] Realtime sync (Supabase/Pocketbase subscription)
- [ ] Optimistic local state on send
- [ ] PWA manifest + service worker (installable on iOS)

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
