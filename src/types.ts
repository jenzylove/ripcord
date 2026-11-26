// Shared types. Every module imports from here; change only with a note in docs/BUILD_LOG.md.

export interface Check {
  id: string;
  ask: string;     // plain English objective for Kane, ends with the values to report
  read: string[];  // value names Kane must return (snake_case); may be empty when assert is set
  assert?: string; // optional: a condition Kane must verify; its pass/fail becomes the value 'assert' (PASS or FAIL)
}

export interface DatabaseSpec {
  service: string;                 // compose service name
  engine: 'postgres' | 'sqlite';
  user?: string;                   // postgres
  db?: string;                     // postgres
  path?: string;                   // sqlite: file path inside the service container
}

export interface RipcordConfig {
  project: string;                 // compose project name of the live stack
  composeFile: string;             // path to docker-compose.yml (relative to ripcord.yml)
  appUrl: string;                  // live app URL, e.g. http://localhost:9925
  appService: string;              // compose service that serves appUrl
  loginVars: Record<string, string>; // Kane variable name -> env var name holding the value
  databases: DatabaseSpec[];
  volumes: string[];               // named volumes to back up (compose names, no project prefix)
  vault: string;                   // absolute path outside the repo
  checks: Check[];
}

export interface BackupManifest {
  id: string;                      // timestamp id, e.g. 20261125T150000Z
  project: string;
  createdAt: string;               // ISO
  composeFile: string;             // copy of the compose file stored in the backup dir
  files: { name: string; kind: 'pg_dump' | 'sqlite' | 'volume'; source: string; bytes: number; sha256: string }[];
}

export interface CopyStack {
  project: string;                 // e.g. rc-copy-20261125T150000Z
  composeFile: string;             // rewritten compose file path
  appUrl: string;                  // URL of the copy
  ports: Record<string, number>;   // service -> host port
}

export type Verdict = 'PROVEN' | 'LOSS' | 'INCONCLUSIVE';

export interface KaneRun {
  status: 'passed' | 'failed' | 'error';
  reasonCode: string;
  summary: string;
  values: Record<string, string>;
  credits: number;
  shareUrl: string | null;
  sessionDir: string | null;
  evidencePack: string | null;
}

export interface CheckResult {
  id: string;
  live: Record<string, string | null>;
  copy: Record<string, string | null>;
  liveOk: boolean;
  copyOk: boolean;
  liveRun?: KaneRun;
  copyRun?: KaneRun;
}

export interface Difference { id: string; key: string; live: string | null; copy: string | null }

export interface RowCount { table: string; live: number; copy: number }

export interface ProofReport {
  id: string;
  project: string;
  backupId: string;
  createdAt: string;
  verdict: Verdict;
  differences: Difference[];
  checks: CheckResult[];
  rowCounts: RowCount[];
  rowCountVerdict: 'MATCH' | 'MISMATCH' | 'UNAVAILABLE';
  creditsUsed: number;
}

export interface State {
  lastBackup?: { id: string; at: string };
  lastProof?: { id: string; verdict: Verdict; at: string; backupId: string };
  lastRiskyCommand?: { command: string; at: string; allowed: boolean };
}

export interface Classified { destructive: boolean; touchesVault: boolean; reason: string }
