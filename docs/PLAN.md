# Ripcord: build plan

Deadline Thu Nov 26 2026 18:29 UTC. Target: submitted by 15:00 UTC Nov 26.

## Stack and layout

Node 20+, TypeScript (ESM, `tsc` build), `vitest` for tests, `commander` for the CLI, `yaml` for config. No other runtime dependencies without a reason in the commit message. Package name `ripcord-cli`, binary `ripcord`.

```
src/
  cli.ts            commander entry: init, backup, prove, fix, verify, rollback, hook install, guard, report
  config.ts         ripcord.yml types, load, validate, write
  compose.ts        parse docker-compose.yml: services, images, ports, volumes, db detection
  docker.ts         run docker / docker compose with MSYS_NO_PATHCONV=1; streams to files
  backup.ts         dump databases, tar volumes, manifest with sha256, vault layout
  restore.ts        build copy compose (new project, fresh volumes, remapped ports), load data, start, wait
  kane.ts           run kane-cli (sequential lock), parse NDJSON run_end, read values, evidence paths
  fingerprint.ts    run each check on live and copy
  compare.ts        pure: normalise and compare values; verdict PROVEN | LOSS | INCONCLUSIVE
  rowcount.ts       per table counts live vs copy (Postgres via psql in the container)
  hook.ts           pure classifier of destructive commands + guard decision from state
  state.ts          .ripcord/state.json: lastBackup, lastProof {id, verdict, at}, lastRiskyCommand
  fix.ts            build Claude Code headless prompt from a LOSS report, run, rerun prove (max 3)
  rollback.ts       restore a proven backup into the live project, then Kane verify
  report.ts         report JSON + static HTML (side by side values, screenshots, share links)
test/               vitest, fixtures from real Kane runs (spike NDJSON files)
study/<app>/        docker-compose.yml, seed script, ripcord.yml checks, methods/{official,community,claude}/{backup.sh,restore.sh,SOURCE.md}
site/               landing, /proof, /demo (static)
docs/               PRD, PLAN, BUILD_LOG, spikes/
```

## Key interfaces (agents must implement exactly these)

```ts
// config.ts
export interface Check { id: string; ask: string; read: string[] }        // ask = plain English for Kane; read = value names Kane must return
export interface RipcordConfig {
  project: string;            // compose project name of the live stack
  composeFile: string;        // path to docker-compose.yml
  appUrl: string;             // live app URL, e.g. http://localhost:9925
  appService: string;         // compose service that serves appUrl
  loginVars: Record<string,string>; // Kane variable name -> env var holding the value (values never in the file)
  databases: { service: string; engine: 'postgres'|'sqlite'; user?: string; db?: string; path?: string }[];
  volumes: string[];          // named volumes to back up (compose names, without project prefix)
  vault: string;              // absolute path outside the repo
  checks: Check[];
}

// compare.ts (pure)
export type Verdict = 'PROVEN'|'LOSS'|'INCONCLUSIVE';
export interface CheckResult { id: string; live: Record<string,string|null>; copy: Record<string,string|null>; liveOk: boolean; copyOk: boolean }
export function normalise(v: string): string;   // lower case, trim, collapse spaces, unicode fractions to decimals (1/3, ⅓, ¹/₃ -> 0.333), strip currency symbols and thousands separators
export function compareChecks(results: CheckResult[]): { verdict: Verdict; differences: { id: string; key: string; live: string|null; copy: string|null }[] };

// kane.ts
export interface KaneRun { status: 'passed'|'failed'|'error'; reasonCode: string; summary: string; values: Record<string,string>; credits: number; shareUrl: string|null; sessionDir: string|null; evidencePack: string|null }
export function parseKaneNdjson(text: string): KaneRun;                       // pure, tested on real fixtures
export async function runKane(o: { objective: string; url: string; vars?: Record<string,{value:string;secret?:boolean}>; maxSteps?: number }): Promise<KaneRun>; // takes a file lock so only one Kane run happens at a time

// hook.ts (pure)
export interface Classified { destructive: boolean; touchesVault: boolean; reason: string }
export function classifyCommand(cmd: string, vaultPath: string): Classified;
export function guardDecision(c: Classified, state: State, now: Date): { allow: boolean; message: string };
```

Kane value reading: the objective must end with "Report <name>: ... " lines; values are read from the run_end memory entries (`"<key>":{"syntax":...,"value":"...","type":"memory"}`); a check whose expected keys are missing is not OK (never PROVEN).

## Phases

| # | What | Who | Done when |
|---|---|---|---|
| 0 | Repo, PRD, PLAN, spikes recorded (docs/spikes) | Opus (me) | pushed |
| 1 | Pure core: config, compose parse, compare, hook classifier, NDJSON parser, state | Sonnet agent A | `npm test` green, fixtures from real Kane runs |
| 2 | Docker engine: backup, restore copy, rowcount, verified on the running Mealie stack (project rclive, port 9925) | Sonnet agent B | a backup and a copy on a free port, Mealie answers, rowcounts equal |
| 3 | Kane runner, fingerprint, prove command, report JSON/HTML | Opus (me) | `ripcord prove` on Mealie prints PROVEN with share links; a volume-less config prints LOSS |
| 4 | Gate, verify, rollback, fix loop | Opus (me), hook tests from agent A | recorded Claude Code session: blocked, proved, allowed, data gone, rollback, Kane proves |
| 5 | Study harnesses for 5 to 7 apps (compose, seed, checks, three methods with sources) | Sonnet agents C and D (no Kane runs; they verify with HTTP/API) | each app: stack up, seeded, three methods run and restore into a copy |
| 6 | Study runs with Kane (sequential), results JSON | Opus (me) | table with every app x method, misses included |
| 7 | Site (landing, /proof from results JSON, /demo) | Sonnet agent E | renders in light and dark, Kane checks it before deploy |
| 8 | Audit (release-readiness-audit), fixes | Opus + Sonnet | findings fixed or listed |
| 9 | README, video, two posts, submission | Opus | submitted |

Rules for every agent: no fake states, no invented numbers, no secrets in files, do not run Kane (credits and the one-run-at-a-time rule are mine), do not commit (I review and commit), write only inside your assigned paths, report what you verified and what you could not.

## Risks

| Risk | Status |
|---|---|
| Kane misreads or false passes | known: values must be read on both sides; INCONCLUSIVE when missing; DOM/API cross-check in the study |
| Kane runs are slow (1 to 3 min) and sequential | known: study runs start as soon as phase 5 harnesses land; one value set per run |
| Study methods lose nothing (official docs are correct) | known: publish as is; the row count vs Kane contrast and the gate loop still stand |
| Docker on Windows path rewriting | known: MSYS_NO_PATHCONV=1 everywhere; streams through stdin/stdout |
| Laptop resources with many stacks | known: one study stack up at a time, torn down after |
| Hooks blocking legitimate work | known: classifier unit tests with allowed cases; `RIPCORD_ALLOW=1` override logged |
