# Wwriting-app

Personal writing tool. Single user (the repo owner). Not intended for distribution.

## For the AI agent reading this

You are working on a project built by one person, for their own use. Your job is to help implement, refine, and restructure this codebase while preserving the intent behind the design decisions already made. This README and the documents under `docs/` are written specifically for you, not for a general audience. Read the files in the order below before making any non-trivial change.

**Required reading, in order:**

1. [`docs/01-purpose.md`](docs/01-purpose.md) — what this app is and why it exists. Read this first; several design decisions will look strange without it.
2. [`docs/02-current-state.md`](docs/02-current-state.md) — what's built, what's in progress, what's broken. Check this before claiming anything works or doesn't.
3. [`docs/03-data-model.md`](docs/03-data-model.md) — the shape of the data. Most breakage in this codebase comes from misunderstanding the Block / Conversation / Folder / Tag / Reference relationships.
4. [`docs/04-decisions.md`](docs/04-decisions.md) — an append-only log of architectural decisions with rationale. **If you are about to reverse a decision here, stop and ask the human instead.**
5. [`docs/05-conventions.md`](docs/05-conventions.md) — code style, naming, file layout, commit messages.
6. [`docs/06-out-of-scope.md`](docs/06-out-of-scope.md) — features and directions that have been explicitly rejected. **Do not add these even if they seem helpful.**
7. [`docs/07-ask-first.md`](docs/07-ask-first.md) — changes that require human input before you proceed.
8. [`docs/08-running.md`](docs/08-running.md) — how to run, test, deploy.
9. [`docs/09-session-handoff.md`](docs/09-session-handoff.md) — how to work across chat and Claude Code without losing context. **Read this if your work session might span multiple environments or days.**

## Core premise (one paragraph)

A free-writing app that looks like an elaborate productivity system. The primary goal is getting thoughts into clean Markdown with minimal friction, in a chat-style composer. The secondary goal is visual sophistication on desktop — the user's screen faces a shared room and "looks like serious work" is a functional requirement, not a joke. Both goals are load-bearing; neither is negotiable.

## Stack (at a glance)

- **Frontend:** React 19 + TypeScript + Vite 8 + Tailwind CSS v4. Single-page app, installable target still applies.
- **Backend:** Supabase — email/password auth, Postgres, and realtime with no custom server.
- **Storage:** Structured rows; Markdown is always the export/copy target, never the storage format.
- **Auth:** Email + password, with email-based password reset.

See `docs/04-decisions.md` for the reasoning behind each of these.

## Operating principles for the AI agent

1. **Read before writing.** This repo has a thought-out design. Read the relevant doc before editing; do not reconstruct the design from the code alone.
2. **Preserve intent.** If you can't tell why something is the way it is, check `docs/04-decisions.md` before "cleaning it up."
3. **Update docs with code.** When you change behavior, the matching doc updates in the same commit. A stale doc is worse than no doc.
4. **Append to `docs/04-decisions.md`.** Every non-obvious choice you make gets an entry with rationale. Future-you (another AI session, no shared memory) needs the same briefing you got.
5. **Small commits, descriptive messages.** Each commit should be independently understandable without reading the diff.
6. **Ask, don't guess, on items in `docs/07-ask-first.md`.** Getting those wrong silently is expensive to undo.
7. **Out-of-scope items stay out of scope.** See `docs/06-out-of-scope.md`. Suggest them in a comment if you think they'd help, but do not build them.

## Repo layout

```
/
├── README.md              ← you are here
├── CLAUDE.md              ← auto-loaded by Claude Code at session start
├── CHANGELOG.md           ← one-line entries, newest first (see conventions)
├── .githooks/             ← git hooks — enable with the one-time setup below
│   ├── README.md
│   └── commit-msg
├── docs/                  ← required reading
│   ├── 01-purpose.md
│   ├── 02-current-state.md
│   ├── 03-data-model.md
│   ├── 04-decisions.md
│   ├── 05-conventions.md
│   ├── 06-out-of-scope.md
│   ├── 07-ask-first.md
│   ├── 08-running.md
│   ├── 09-session-handoff.md
│   └── NOTES.md           ← scratchpad for in-flight thoughts
├── prototype/             ← working reference implementation (see docs/02)
│   └── writing-app.html
├── public/                ← static assets
├── src/                   ← application code
│   ├── app/
│   ├── components/
│   ├── db/
│   ├── lib/
│   └── styles/
└── (build / config files at root)
```

## First-time setup in a fresh clone

Before making any commits in this repo, enable the custom git hooks:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/*
```

The `commit-msg` hook enforces the repo's commit-message convention (see `docs/05-conventions.md` §Git conventions). You can always bypass it with `--no-verify`, but the default is to be enforced.
