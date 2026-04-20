# .githooks

Custom git hooks for this repo. Enforces conventions that matter enough to fail the commit rather than hope.

## Enable once per clone

Git does not pick up `.githooks/` automatically. Run this once after cloning:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/*
```

From then on, the hooks run on every commit in this clone.

## Hooks in this directory

### `commit-msg`

Rejects commits whose messages don't meet the repo's "commits as AI context" convention:

- Subject line must exist and be ≤72 characters.
- Commits touching more than ~10 lines of diff must include a body explaining *why*.
- Merge and revert commits are exempt.

See `docs/05-conventions.md` §Git conventions and `docs/04-decisions.md` §015 for the rationale.

## Bypassing (rare)

If you genuinely need to commit without the hook — mid-rebase housekeeping, a quick typo fix with a legitimately long subject, etc. — use `--no-verify`:

```bash
git commit --no-verify -m "..."
```

This is an escape hatch, not a habit. If you find yourself reaching for it often, the hook's thresholds probably need tuning; raise that as an ADR proposal.

## Why not Husky / lefthook / pre-commit?

Dependency-free. This is a single-person repo (see `docs/01-purpose.md`). A shell script in `.githooks/` is smaller than any hook framework and has zero install footprint. If the repo ever grows a team, a framework can replace this — until then, a Bash script is the right answer.
