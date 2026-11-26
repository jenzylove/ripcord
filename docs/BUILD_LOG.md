# Build log

| When (UTC) | What now works | Evidence |
|---|---|---|
| Nov 25 14:47 | Idea locked; PRD and plan written | docs/PRD.md, docs/PLAN.md |
| Nov 25 06:20 | Spike: Kane tells a full restore from a database-only restore on Mealie | docs/spikes/mealie-restore.md, test/fixtures |
| Nov 25 18:30 | Core logic, Docker engine (backup, copy restore, row counts), Kane runner with a one-run-at-a-time lock, prove, verify, guard hook, rollback, fix loop, report page; 123 tests | `npx vitest run` |
| Nov 25 18:35 | Engine smoke on live Mealie: copy answered on a new port, 70 tables, 0 row mismatches, copy removed | scripts/engine-smoke.mjs |
| Nov 25 18:40 | Guard hook on real Claude Code hook JSON: DELETE without WHERE and `compose down -v` blocked until a proof exists; vault always blocked; DELETE with WHERE allowed; PostToolUse asks for `ripcord verify` | manual run, test/hook.test.ts (58 tests) |
| Nov 26 05:00 | Assertion checks (Kane's pass or fail is the value); presence answers compared by meaning; a loss must be seen twice | 134 tests |
| Nov 26 09:00 | Release audit (read only, separate agent); every bug fixed: classifier gaps, guard fails closed and covers Edit/Write, lost rows count as LOSS, rollback checks checksums and saves a pre-rollback backup, fix may not change checks | commit "Audit fixes" |
| Nov 26 10:30 | Study: 8 real cases on Mealie, n8n, Vikunja; two restores matched every row and lost photos or attachments, caught only by Kane | site/data/results.json, site/evidence.html |
| Nov 26 10:35 | Fix loop: LOSS, Claude Code added the missing volume, PROVEN after 1 round | site/runs/fix.json |
| Nov 26 11:39 | Real Claude Code gate session, verify (3 to 0) and rollback (3 back) | site/runs/gate.json, site/logs |
| Nov 26 12:50 | Demo video 3:03 | site/media/demo.mp4 |
