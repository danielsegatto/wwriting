# 06 — Out of Scope

Features and directions that have been considered and rejected. **Do not implement these.** If you believe one has become relevant, raise it with the human before building it.

## Not now, not later

### Collaboration, sharing, comments

No multi-user features. No "share this conversation," no comments, no permissions, no presence indicators. This is a single-user app.

Why: the design and data model are dramatically simpler without multi-tenancy at the content level. Row-level security by `user_id` is the only access control in the system.

### Offline-first

Always-online is the baseline. The app can be a PWA and cache its shell, but the data path assumes a network connection.

Why: offline-first means either building a conflict resolution UI or using CRDTs. Both are massive engineering commitments for marginal value in a single-user app that's almost always online.

### AI features inside the app

No "summarize this conversation," no "suggest tags," no AI completions in the composer. The AI lives in the IDE where this code is written, not in the running app.

Why: the user wants an uncluttered writing environment. AI features would add latency, cost, and noise to the exact hot path the app is optimized to keep clean.

### Rich-text editing

No bold/italic/heading toolbar that produces non-Markdown output. Markdown source stays the storage format.

Why: see `docs/04-decisions.md` §010. A mobile keyboard toolbar that *inserts Markdown syntax at cursor* is allowed (`**`, `*`, `[]()`, etc.) — that's a shortcut, not a rich-text layer.

### Native apps

iOS/Android native apps, Electron desktop app. Not on the table.

Why: a PWA with a good service worker is installable on iOS and runs in any desktop browser. The user accepts PWA limitations as the cost of not maintaining three codebases.

### Block types beyond text, divider, and (eventually) quote/image/embed

The `blocks.type` enum is extensible, but do not speculatively add types. When the user wants `image` Blocks, that conversation happens first.

### Tag hierarchy / tag aliases / tag parents

Tags are a flat namespace. One level. No `work/meetings` tag parenting `work/meetings/weekly`.

Why: tags are cross-cutting by design; hierarchy goes in Folders. If the user wants hierarchical grouping, they use Folders.

### Views, queries, filters as first-class objects

No saved searches, no custom "all Blocks tagged #x from last week" views persisted as entities.

Why: feature creep toward Notion. If search becomes good enough, saved queries are a small addition later; do not speculatively build the machinery.

### Plugins, extensions, user scripts

Not a platform. Not an ecosystem. One user, one feature set.

## Behavior changes that look helpful but aren't

### Auto-linking URLs in block bodies

Don't silently wrap `https://...` in Markdown link syntax on send. The user writes Markdown explicitly. Rendering a bare URL as a clickable link is fine in the view; modifying the stored body is not.

### Auto-formatting or auto-correction

No smart quotes, no auto-capitalization, no em-dash substitution. The composer passes text through unchanged.

### Reordering Blocks by timestamp

Blocks are ordered by `position`, not `created_at`. Even if the two happen to match for newly-created Blocks, reorders use `position`. Do not add a "sort by created_at" toggle.

### Confirmation dialogs for delete

Delete is delete, no modal confirm. The user knows what they're doing. Undo is the correct pattern (deferred; see `docs/02-current-state.md`). A "type DELETE to confirm" dialog is the wrong pattern.

### Limiting body length

No character limit on Block bodies. Long bodies get "tap to collapse" in the UI (see `docs/04-decisions.md` §008), but there is no upper bound on what the user can write.

## If you think one of these should change

Write an ADR proposal *in a separate document* (`docs/proposals/NNN-short-name.md`), linked from the relevant conversation with the human. Do not modify `docs/06-out-of-scope.md` to delete an entry without explicit human approval.
