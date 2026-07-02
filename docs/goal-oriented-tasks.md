# Goal-oriented tasks

Large, well-scoped changes here are run as **goal-oriented (long-running) tasks**: you state a
completion condition and the work continues across turns until that condition verifiably holds.
In Claude Code that's `/goal`, but the discipline is general — it's just "define done, then work
until done is provably true."

## A goal is a verifiable condition

State **one measurable end state and how it's proven** — something the work's own output can
demonstrate. A `/goal` evaluator (like a reviewer skimming the thread) judges only what's
**surfaced in the conversation**; it doesn't run commands or open files. So the task must **run
each check and paste the result**:

- tests exit 0, typecheck clean, lint zero-warnings, coverage meets the bar, the build succeeds
  (see `docs/definition-of-done.md`)
- each behaviour in the task's Definition of Done is proven by a named test whose pass is shown

## Running one well

- Point the goal at a spec or acceptance list — not a vague description.
- List each Definition-of-Done item with its evidence before declaring done.
- If a criterion can't be met, **stop and report the blocker** — don't loop.
- Bound long runs (e.g. "…or stop after ~20 turns") so the task reports progress instead of
  spinning.
