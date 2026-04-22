# CHANGELOG

Newest entries first. One line per change. Format:

```
## YYYY-MM-DD

- Short description of change. (commit-sha)
```

---

## 2026-04-22

- Deploy GitHub Pages through a GitHub Actions workflow that builds Vite output from `main` and publishes `dist/`.
- Add Conversation Markdown export in the header with shared copy/download formatting, citation-link translation, and unit tests.
- Add Block drag-to-reorder, multi-select bulk move/delete, and composer `#` tag suggestions with create-from-composer support.
- Fix citation picker trigger so `@` opens in the composer and inline block editing, including edit-mode citation insertion.
- Add end-to-end citations: `@` composer picker, `block_references` reconciliation on create/edit, rendered citation pills with cross-conversation jump + highlight, and unit tests for `src/lib/references.ts` / `src/lib/markdown.ts`.
- Add block action menus with inline text-block editing, block move picker, delete confirmation, and shared inline-tag reconciliation helpers in `src/lib/blocks.ts` / `src/lib/tags.ts`.
- Add block-level tag picker with picker-only tag removal and mobile-safe picker positioning in BlockFeed; extend `src/lib/tags.ts` with tag listing and per-block tag aggregation helpers.
- Add inline Create Folder / Create Conversation to sidebar: "+" in header creates a folder; "+" on hover per folder creates a conversation; inline input with Enter/Escape/blur handling; auto-navigate on creation. (cba8976)
- Add Sidebar tree: collapsible folders, conversation leaves, click-to-select; `src/lib/folders.ts` + `listConversations` added to `src/lib/conversations.ts`; App.tsx refactored to two-column layout with split effects.
- Add BlockFeed component with Markdown rendering (`marked`), divider support, optimistic append, and history load on mount. (0caa535)
- Add Composer component with Enter-to-send, Shift+Enter newline, divider detection, inline #hashtag parsing. (6a23717)
- Add `src/lib/blocks.ts`, `tags.ts`, `conversations.ts` (minimal write-path lib layer); fix `src/db/types.ts` for `@supabase/postgrest-js` 2.104. (21a101b)

## 2026-04-20

- Add auth gate with Supabase Auth UI (`@supabase/auth-ui-react`). (d825d7c)
- Add Supabase client, DB types, and initial schema migration. (ed55f6e)
- Scaffold React 19 + Vite 8 + Tailwind CSS v4; wire error reporter into `main.tsx`. (cadcbf3)
- Add framework-neutral visible error reporter under `src/lib/errors.ts`. (b43742b)
- Add working prototype at `prototype/writing-app.html` as MVP behavioral reference. (e19947f)
- Enable `.githooks/commit-msg` to enforce AI-context commit convention. (76735e2)
- Initial documentation scaffold — all of `docs/`, README, CLAUDE.md. (b8e3512)
