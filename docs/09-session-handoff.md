# 09 — Session handoff

The human works on this project from multiple environments:

- **Chat UI** (Anthropic web/app). Used for design, planning, drafting, and one-off implementation help.
- **Claude Code in Codespaces / terminal.** Used for sustained coding work inside the repo.

These environments do not share memory. Context survives the switch only if it lives in the repo.

## The one-way rule

**The repo is the source of truth. Chat is not.**

Anything decided, discovered, or changed must be written into the repo before the current session ends. If it only exists in a chat transcript, it is considered lost.

This applies to:

- Design decisions ( → `docs/04-decisions.md`)
- State changes ( → `docs/02-current-state.md` + `CHANGELOG.md`)
- New conventions or rules ( → `docs/05-conventions.md`)
- New ask-first or out-of-scope items ( → relevant doc)
- Half-finished ideas that should be picked up later ( → `docs/NOTES.md`, see below)

## `docs/NOTES.md` — the scratchpad

For partial thoughts that aren't ready to be a decision yet but should not be lost. Rules:

- Dated entries, newest first.
- Each entry is a short paragraph: what was considered, why no decision was reached, what would unblock one.
- When an entry becomes a decision, move it to `04-decisions.md` and delete it from `NOTES.md`.
- When an entry is abandoned, strike it through with a note explaining why.

This prevents the "I remember we talked about this but I can't find it" failure mode.

## Starting a new session

### In Claude Code (Codespaces, terminal)

Opening instructions for the agent:

1. Read `README.md`.
2. Read the docs in the order the README lists.
3. Read the last 2 weeks of `CHANGELOG.md` entries (or since the last session — whichever is longer).
4. Run `git log -20` (no flags — full bodies). Commit messages in this repo are written as context for you; do not skip the bodies. See `docs/04-decisions.md` §015.
5. Run `git status` to see any uncommitted work from a previous session.
6. Skim `docs/NOTES.md` for in-flight thoughts.
7. Then ask the human what to do.

Do not start work without this orientation. Even if the human gives a clear task, first read the docs and recent commits to ensure the task aligns with the current state.

### In chat (web UI)

When the human opens a new chat:

1. The human pastes (or links to) the last few `CHANGELOG.md` entries.
2. The human names the specific doc they want to work on, if any.
3. The agent orients from the pasted context, then asks before acting.

If the human forgets to paste context, the agent asks for it rather than guessing from chat history.

## Ending a session

Regardless of environment, before closing:

1. Everything new or changed is committed. No uncommitted work.
2. `docs/02-current-state.md` reflects reality.
3. `docs/04-decisions.md` has entries for today's non-obvious choices, with today's date.
4. `CHANGELOG.md` has entries for today's commits.
5. If any thought is mid-flight, it's captured in `docs/NOTES.md` with enough detail that a future session can resume it.
6. `git push`. Unpushed work is invisible to the other environment.

## Moving between environments mid-task

If you're in the middle of something in chat and need to continue in Codespaces (or vice versa):

1. **Chat → Codespaces.** The chat agent writes a handoff note to `docs/NOTES.md` with: current task, what's done, what's next, any context that wouldn't be obvious from the code. Commit and push. In Codespaces, Claude Code reads `NOTES.md` first.

2. **Codespaces → Chat.** Commit current work (even if WIP) with a clear message. Push. In chat, paste the last commit SHA and the relevant `NOTES.md` entry if one exists.

## Why this is load-bearing

Without this protocol, every environment switch leaks context. Over weeks, the project accumulates "we decided this somewhere, I think" ambiguity. That ambiguity is expensive because it produces re-litigation, reversed decisions, and slow starts to every session.

With this protocol, each session begins with the agent fully oriented in under a minute, regardless of environment.

## What the human does to enforce this

- When ending a chat, ask: "is everything we decided now in the repo?" If no, make it so.
- When starting a Codespaces session, confirm the agent read the required docs before assigning work.
- Periodically (weekly is fine), skim `02-current-state.md` and `04-decisions.md`. If anything surprises you, there's drift; fix it before it compounds.
