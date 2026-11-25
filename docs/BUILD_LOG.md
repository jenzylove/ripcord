# Build log

| When (UTC) | What now works | Evidence |
|---|---|---|
| Nov 25 14:47 | Idea locked; PRD and plan written | docs/PRD.md, docs/PLAN.md |
| Nov 25 06:20 | Spike: Kane tells a full restore from a database-only restore on Mealie | docs/spikes/mealie-restore.md, test/fixtures |
| Nov 25 18:30 | Core logic, Docker engine (backup, copy restore, row counts), Kane runner with a one-run-at-a-time lock, prove, verify, guard hook, rollback, fix loop, report page; 123 tests | `npx vitest run` |
| Nov 25 18:35 | Engine smoke on live Mealie: copy answered on a new port, 70 tables, 0 row mismatches, copy removed | scripts/engine-smoke.mjs |
| Nov 25 18:40 | Guard hook on real Claude Code hook JSON: DELETE without WHERE and `compose down -v` blocked until a proof exists; vault always blocked; DELETE with WHERE allowed; PostToolUse asks for `ripcord verify` | manual run, test/hook.test.ts (58 tests) |
