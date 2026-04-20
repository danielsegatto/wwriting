# 03 — Data Model

This document is the source of truth for the data model. If code disagrees with this doc, one of them is wrong; determine which and fix it in the same commit.

## Core concepts

- **Block** — atomic unit of content. A message-sized chunk of Markdown-source text (or a divider marker).
- **Conversation** — an ordered sequence of Blocks. Leaf of the tree.
- **Folder** — a container for Folders and/or Conversations. Nestable.
- **Tag** — a user-scoped label. Blocks can have many tags; tags can be on many Blocks (M:N).
- **Reference** — a directed citation from one Block to another.

## Entity: `users`

Managed by the auth provider (Supabase/Pocketbase). Do not write to it directly.

| field         | type   | notes                                |
|---------------|--------|--------------------------------------|
| id            | uuid   | primary key                          |
| email         | text   | unique                               |
| created_at    | ts     |                                      |

All other tables have `user_id` denormalized onto them to make row-level security trivial. See `docs/04-decisions.md` for the rationale.

## Entity: `folders`

Forms a tree via `parent_id` self-reference.

| field          | type   | notes                                |
|----------------|--------|--------------------------------------|
| id             | uuid   | pk                                   |
| user_id        | uuid   | fk → users, indexed                  |
| parent_id      | uuid   | fk → folders, nullable (null = root) |
| name           | text   |                                      |
| position       | text   | fractional index; see §Ordering      |
| created_at     | ts     |                                      |
| updated_at     | ts     |                                      |

Constraints:
- A Folder cannot be its own ancestor (enforced in application logic on move; a DB-level constraint via recursive CTE is acceptable but not required).

## Entity: `conversations`

Leaves of the tree. Conversations do not nest.

| field          | type   | notes                                |
|----------------|--------|--------------------------------------|
| id             | uuid   | pk                                   |
| user_id        | uuid   | fk → users, indexed                  |
| folder_id      | uuid   | fk → folders, NOT NULL               |
| name           | text   |                                      |
| position       | text   | fractional index                     |
| created_at     | ts     |                                      |
| updated_at     | ts     |                                      |

## Entity: `blocks`

The atomic unit.

| field            | type   | notes                                      |
|------------------|--------|--------------------------------------------|
| id               | uuid   | pk                                         |
| user_id          | uuid   | fk → users, indexed                        |
| conversation_id  | uuid   | fk → conversations, indexed                |
| type             | enum   | `'text' \| 'divider'`, default `'text'`    |
| body             | text   | nullable; empty/null for dividers          |
| position         | text   | fractional index within conversation       |
| created_at       | ts     |                                            |
| updated_at       | ts     |                                            |

Enum is open-ended by design. Future Block types (`image`, `quote`, `embed`) are expected; adding them must not require migrating existing rows.

### Body content rules

- `body` is Markdown source. Do not HTML-encode on write.
- Custom tokens inside `body`:
  - `{{block:<uuid>}}` — citation to another Block. Format is exact: two open braces, literal `block:`, a UUID v4, two close braces.
  - `#hashtag` — tag reference. Matches `(^|\s)#([a-zA-Z0-9_-]+)`. The leading whitespace/boundary is required; `foo#bar` does not match.
- On save, the application MUST:
  1. Parse all `#hashtag` occurrences in `body`.
  2. Ensure a `tags` row exists for each (creating as needed, scoped by `user_id`).
  3. Reconcile `block_tags` rows: tags newly introduced get rows inserted, tags removed from the body get rows deleted (only if source='inline'; see below).
  4. Scan `{{block:<uuid>}}` tokens and reconcile `block_references` to match.

## Entity: `tags`

User-scoped. Not tenant-scoped within a user (one namespace per user).

| field      | type   | notes                          |
|------------|--------|--------------------------------|
| id         | uuid   | pk                             |
| user_id    | uuid   | fk → users, indexed            |
| name       | text   | unique per user, lowercase     |
| color      | text   | nullable; for UI               |
| created_at | ts     |                                |

Garbage-collect tags with no `block_tags` rows.

## Entity: `block_tags`

M:N join between `blocks` and `tags`, with provenance.

| field     | type   | notes                                    |
|-----------|--------|------------------------------------------|
| block_id  | uuid   | fk → blocks                              |
| tag_id    | uuid   | fk → tags                                |
| source    | enum   | `'inline' \| 'picker'`                   |
| created_at| ts     |                                          |

Composite primary key: `(block_id, tag_id, source)`.

Why `source`: the user can add a tag in two ways — by typing `#foo` in the body (inline) or by using the tag picker UI (picker). Editing a block's body automatically reconciles inline rows; picker rows are only touched by the picker. A Block has a tag applied if any row with any source exists.

## Entity: `block_references`

Directed citation edges.

| field              | type  | notes                                   |
|--------------------|-------|-----------------------------------------|
| id                 | uuid  | pk                                      |
| source_block_id    | uuid  | fk → blocks, indexed                    |
| target_block_id    | uuid  | fk → blocks, indexed                    |
| created_at         | ts    |                                         |

Reconciled from tokens in `blocks.body`. If `target_block_id` is deleted, referring Blocks keep their `{{block:<uuid>}}` token in their body; the UI renders it as `[deleted]`. `block_references` rows with a missing target are cleaned up by cascade delete on `target_block_id`.

## Entity: `user_settings`

| field       | type  | notes                  |
|-------------|-------|------------------------|
| user_id     | uuid  | pk, fk → users         |
| preferences | jsonb | loose bag of settings  |
| updated_at  | ts    |                        |

JSONB during MVP. Promote keys to typed columns as they stabilize.

## Ordering: fractional indexing

`position` is a TEXT column on `folders`, `conversations`, and `blocks`. Values are generated using fractional indexing (e.g., `fractional-indexing` npm package). To insert between two items with positions `"a0"` and `"a1"`, generate a new string like `"a0V"` that sorts between them.

**Never use integer positions.** Reordering with integers requires renumbering, which is slow and ugly. Fractional indexing means any reorder is a single UPDATE of one row.

On first insert at the end of a list: use the generator's "end" helper against the existing max. On first insert into an empty list: use a neutral seed (the generator provides one). Ties are impossible when the generator is used correctly.

## Indexes to create from day one

```sql
CREATE INDEX idx_folders_parent ON folders(parent_id);
CREATE INDEX idx_folders_user ON folders(user_id);
CREATE INDEX idx_conversations_folder ON conversations(folder_id);
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_blocks_conversation_position ON blocks(conversation_id, position);
CREATE INDEX idx_blocks_user ON blocks(user_id);
CREATE INDEX idx_block_tags_tag ON block_tags(tag_id);
CREATE INDEX idx_block_references_target ON block_references(target_block_id);
```

Full-text search (Phase 2):

```sql
ALTER TABLE blocks ADD COLUMN body_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(body, ''))) STORED;
CREATE INDEX idx_blocks_body_tsv ON blocks USING GIN(body_tsv);
```

Use `'simple'` config (not language-specific) because the user writes in multiple languages.

## Row-level security

Every query filters on `user_id = auth.uid()`. Set RLS policies on every table. Denormalizing `user_id` onto `blocks`, `conversations`, and `folders` makes these policies single-clause and cheap.

## What is deliberately missing

- **No `headline` column on Blocks.** Previews are derived from `body` in the UI. If editable titles become a requirement, add the column then — not speculatively.
- **No soft-delete / archive flag.** Delete is delete. Backups exist via export.
- **No version history.** Can be added as `block_revisions` later without touching existing tables.
- **No collaboration / sharing fields** (`shared_with`, `owner_id` vs `created_by`, etc.). Single-user app.
