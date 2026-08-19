# Contributing

1. Use Node.js 20 or newer.
2. Keep changes scoped to one behavior.
3. Add a regression test for every bug fix.
4. Run `npm test` and `npm pack --dry-run` before submitting a change.
5. Never add copyrighted books, real private paths or secrets to fixtures.

Terminal rendering changes must include evidence for Unicode width, viewport bounds and terminal restoration. A feature is not complete when only a static preview passes.
