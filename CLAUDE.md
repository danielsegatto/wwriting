# CLAUDE.md

This file is loaded automatically at the start of every Claude Code session. It orients you — the AI agent — to this repository. **Follow these instructions exactly. They override any default behavior.**

## Who this repo belongs to

One person. Personal writing tool. Not for distribution. You are here to help them implement, refine, and restructure the codebase while preserving the intent behind the design decisions already made.

## Before you do anything

Read these files in this exact order. Do not skip. Do not skim.

1. `README.md` — overview and operating principles for you specifically.
2. `docs/01-purpose.md` — the *why*. Several design decisions look strange without this context.
3. `docs/02-current-state.md` — what's built, what's planned, what's broken. Check this before claiming anything works.
4. `docs/03-data-model.md` — the shape of the data. Most breakage comes from misunderstanding the Block / Conversation / Folder / Tag / Reference relationships.
5. `docs/04-decisions.md` — append-only log of architectural decisions with rationale. **Do not reverse any entry without asking the human first.**
6. `docs/05-conventions.md` — code style, naming, file layout, **commit message conventions (these matter — see below)**.
7. `docs/06-out-of-scope.md` — features explicitly rejected. **Do not build these even if they seem helpful.**
8. `docs/07-ask-first.md` — changes that require human input before you proceed. **Respect this list.**
9. `docs/08-running.md` — how to run, test, deploy.
10. `docs/09-session-handoff.md` — how work moves between chat and Claude Code without losing context.

Then also:

- Read the last two weeks of `CHANGELOG.md`.
- **Read the last 10–20 commit bodies, not just `--oneline`.** Commit messages in this repo are written as durable context for you — they include why-and-alternatives, not just what-changed. Run `git log -20` (with no flags, so you see full bodies). See `docs/04-decisions.md` §015.
- Run `git status` to see any uncommitted work from a previous session.
- Skim `docs/NOTES.md` for in-flight thoughts.

Only after this orientation are you ready to act. Even if the human gives you a clear task, orient first to make sure the task aligns with the current state.

## The non-negotiables, up front

These are in the docs but matter enough to repeat at the top so you cannot miss them:

1. **Two goals, both load-bearing.** Friction-free writing (Goal 1) and desktop visual sophistication (Goal 2 — the user's screen faces other people; looking elaborate is a *functional* requirement, not polish). Neither is optional.
2. **Errors must be visible in the UI, not the console.** The human often works in environments without devtools access (chat-based artifact renderers). Every error routes through the central reporter and shows up in the in-app event log. See `docs/04-decisions.md` §014. Never swallow errors silently; never use lone `console.error` as an error-handling strategy.
3. **Read before writing.** Don't reconstruct the design from the code alone. The docs exist for a reason.
4. **Preserve intent.** If you can't tell why something is the way it is, check `docs/04-decisions.md` before "cleaning it up."
5. **Update docs with code.** Every commit that changes behavior updates the matching doc in the same commit.
6. **Log decisions.** Every non-obvious choice you make gets an entry in `docs/04-decisions.md` with today's date.
7. **CHANGELOG every commit.** One-line entry per non-trivial commit, dated, newest-first.
8. **Out-of-scope items stay out of scope.** See `docs/06-out-of-scope.md`. If you think one should change, write a proposal in `docs/proposals/`; do not silently build it.
9. **Ask, don't guess.** See `docs/07-ask-first.md` for the list of things that need human input.
10. **Session-end checklist exists.** See `docs/05-conventions.md`. Run it before you finish. Push before you stop.
11. **Write commit messages as context, not summary.** Every non-trivial commit you author in this repo must include a body explaining *why*, *what alternatives you considered*, and *what to watch out for*. These messages are how future AI sessions (including future-you) catch up on the reasoning behind the code. Subject line + empty diff commentary is not acceptable. See `docs/05-conventions.md` §Git conventions and `docs/04-decisions.md` §015.

## Domain terms — use exactly these words

- **Block** (not message, item, entry)
- **Conversation** (not chat, thread, channel)
- **Folder** (not directory, group, space)
- **Tag** (not label, category)
- **Reference** (not link, citation-only when referring to the UI affordance)

Consistent terminology in code, UI strings, and docs is a hard requirement, not a preference.

## When you're unsure

Ask the human. The cost of a brief question is always lower than the cost of a silently wrong call.
