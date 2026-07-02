# Definition of Done — how you finish (and how `/goal` checks it)

Your spec ends with a **Definition of Done**. The `/goal` evaluator only reads what you
**surface in the conversation** — it never runs commands or opens files — so prove completion by
running each check and **pasting its result**:

- `npm test -w <your-dir>` exits 0 · `npm run typecheck -w <your-dir>` clean · `npm run lint`
  zero warnings · changed files ≥85% coverage · `npm run build -w <your-dir>` succeeds
- Constraints held: **only your directory changed · `contracts/` untouched · no new dependencies ·
  not pushed**
- Post a one-line progress update as you finish each milestone (that's the host's feed).

**Declaring done:** list each Definition-of-Done item from your spec and paste the command + its
result (or the name of the test that proves it). If you can't meet one, stop and report the
blocker — don't loop.
