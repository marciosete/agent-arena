# Definition of Done

A change is done when you've **run it and shown the passing output** for:

- `npm test -w <dir>` exits 0
- `npm run typecheck -w <dir>` is clean
- `npm run lint` reports zero warnings
- changed files meet **≥85% coverage**
- `npm run build -w <dir>` succeeds

plus the workstream-specific checks in your spec's own Definition of Done — each proven by a
named test.
