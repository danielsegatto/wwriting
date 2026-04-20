# 01 — Purpose

## What this app is

A writing tool. One user. Chat-style composer where each sent message is a discrete, addressable Block of Markdown text. Blocks live inside Conversations. Conversations live inside nestable Folders.

## What it is for

Getting thoughts out of the user's head into persistent, searchable, exportable text, as fast as the thinking happens. The composer is modeled on WhatsApp's message entry because that interaction is unambiguous and muscle-memory fast: type, send, it's saved.

## What it is *not* for

- Collaboration. Single user. No multi-user features will be built.
- Long-form structured documents. Use a word processor.
- Real-time chat with anyone. "WhatsApp-style" refers to the composer, nothing else.
- Task management. Tags exist, but are for grouping thoughts, not tracking work.

## The two non-negotiable goals

### Goal 1: Friction-free writing

Composing and sending a Block must take fewer taps/keystrokes than any other action. Every feature is evaluated first against whether it slows this down. If a feature would add any friction to the hot path, it must be accessible through an opt-in gesture (menu, modifier key, etc.) rather than live in the primary flow.

### Goal 2: Desktop theatrics

The user's desktop screen is positioned facing other people in a shared space. The desktop UI must appear visually sophisticated — a tool that someone glancing at it assumes is complex and work-related. This is not a joke or a nice-to-have. It is a requirement that shapes the desktop UI.

Theater-layer features are documented separately as "Phase 3" in `docs/02-current-state.md`. They ship after the core writing loop is solid.

**Important:** theatrical complexity must never intrude on Goal 1. The advanced-looking UI sits *around* the writing area; the writing area itself stays minimal.

## Why nestable folders, not tags-only

Hierarchy is something the user wants for filing, in addition to tags for cross-cutting grouping. Both exist. Do not propose replacing Folders with tag-only organization. This decision is in `docs/04-decisions.md`.

## Why Markdown canonical

- It is the lowest-common-denominator text format.
- It survives outside this app. The user can copy a Conversation into any other tool and it renders correctly.
- It is human-readable in source form, which matters for backup and debugging.

Bodies are stored as Markdown source (plain text). Rendering to HTML is a view-layer concern. Export is trivial because the storage format and the export format are the same thing, with two custom tokens translated out.

## Why custom tokens (`{{block:<uuid>}}` and `#hashtag`) in bodies

- `{{block:<uuid>}}` is the canonical citation form in stored bodies. It resolves to a block-preview pill in the rendered view and to a Markdown link in export. The token survives round-tripping through edits, because the body is stored as-is.
- `#hashtag` is parsed out of bodies at save time to populate the `block_tags` table. It renders as a pill but remains literal `#hashtag` in the source, so it round-trips through export unchanged.

Do not replace these with "cleaner" alternatives (wiki-style `[[brackets]]`, inline YAML frontmatter, etc.). The trade-offs have been considered. See `docs/04-decisions.md`.

## Error visibility is part of the UI

All runtime errors must be visible inside the app itself, not just in the browser console. The human often develops this app in environments where the console is not accessible (for example, inside a chat-based artifact renderer). If the app silently fails in those environments, the human cannot diagnose it.

This means:

- A persistent, visible event log in the UI that captures all errors, warnings, and key info events.
- Global handlers for `window.error` and `window.unhandledrejection` route into that log automatically.
- Any caught error inside the app reports to the log rather than being silently swallowed.
- A visible status indicator flags the presence of unread errors so they can't be missed.

This principle is codified as a decision in `docs/04-decisions.md` §014. It affects how every feature handles failure: not with `console.error`, but with `report('error', ...)`.

The visible log also happens to serve Goal 2 (desktop visual sophistication) — a developer-console-style log at the bottom of the UI reinforces the "serious tool" impression. Dual-purpose, but the functional requirement comes first.
