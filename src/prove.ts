// prove: back up, restore a throwaway copy, have Kane read the same things on both, compare, report.
import { dirname, join, resolve } from 'node:path';
import type { CheckResult, ProofReport, RipcordConfig, RowCount } from './types.js';
import { loadConfig } from './config.js';
import { createBackup } from './backup.js';
import { restoreCopy, destroyCopy } from './restore.js';
import { countRows, compareRowCounts } from './rowcount.js';
import { runChecks, objectiveFor, pick, ok } from './fingerprint.js';
import { runKane } from './kane.js';
import { compareChecks } from './compare.js';
import { writeReport } from './report.js';
import { readState, writeState } from './state.js';

export function kaneVars(cfg: RipcordConfig): Record<string, { value: string; secret?: boolean }> {
  const vars: Record<string, { value: string; secret?: boolean }> = {};
  for (const [name, envName] of Object.entries(cfg.loginVars)) {
    const value = process.env[envName];
    if (!value) throw new Error(`Environment variable ${envName} (for Kane variable ${name}) is not set.`);
    vars[name] = { value, secret: /pass|token|secret|key/i.test(name) };
  }
  return vars;
}

export function stamp(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

export interface ProveOptions {
  configPath: string;
  keepCopy?: boolean;
  copyUrl?: string;      // skip backup and restore: compare the live app against an already restored copy
  label?: string;        // backup id or method label when copyUrl is used
  log?: (s: string) => void;
}

export async function prove(o: ProveOptions): Promise<{ report: ProofReport; files: { json: string; html: string } }> {
  const log = o.log ?? ((s: string) => console.log(s));
  const cfg = loadConfig(o.configPath);
  const projectDir = dirname(resolve(o.configPath));
  const vars = kaneVars(cfg);

  let backupId = o.label ?? 'external';
  let copyUrl = o.copyUrl;
  let rowCounts: RowCount[] = [];
  let rowCountVerdict: ProofReport['rowCountVerdict'] = 'UNAVAILABLE';
  let copy: Awaited<ReturnType<typeof restoreCopy>> | null = null;

  if (!copyUrl) {
    log('Backing up the live stack...');
    const manifest = await createBackup(cfg);
    backupId = manifest.id;
    log(`Backup ${manifest.id}: ${manifest.files.length} files in ${cfg.vault}`);
    const st = readState(projectDir);
    writeState(projectDir, { ...st, lastBackup: { id: manifest.id, at: new Date().toISOString() } });
    log('Restoring a throwaway copy...');
    copy = await restoreCopy(cfg, manifest);
    copyUrl = copy.appUrl;
    log(`Copy ${copy.project} answering at ${copy.appUrl}`);
    try {
      const pg = cfg.databases.filter((d) => d.engine === 'postgres');
      for (const db of pg) {
        const live = await countRows(cfg.project, cfg.composeFile, db);
        const cp = await countRows(copy.project, copy.composeFile, db);
        rowCounts.push(...compareRowCounts(live, cp));
      }
      if (pg.length) rowCountVerdict = rowCounts.every((r) => r.live === r.copy) ? 'MATCH' : 'MISMATCH';
    } catch (e) {
      log(`Row counts unavailable: ${(e as Error).message}`);
    }
  }

  log(`Kane reads ${cfg.checks.length} checks on the live app and on the copy (one run at a time)...`);
  let checks: CheckResult[] = [];
  try {
    checks = await runChecks(cfg.checks, { liveUrl: cfg.appUrl, copyUrl: copyUrl!, vars, log });
    // A loss must be seen twice: every check that disagrees is read again on both sides before it counts.
    const first = compareChecks(checks);
    const disputed = [...new Set(first.differences.map((d) => d.id))];
    if (first.verdict === 'LOSS' && disputed.length) {
      log(`Confirming ${disputed.length} disagreeing check(s) with a second reading on both sides...`);
      const again = await runChecks(cfg.checks.filter((c) => disputed.includes(c.id)), { liveUrl: cfg.appUrl, copyUrl: copyUrl!, vars, log });
      checks = checks.map((c) => {
        const r = again.find((x) => x.id === c.id);
        if (!r) return c;
        const firstPair = compareChecks([c]).verdict;
        const secondPair = compareChecks([r]).verdict;
        // confirmed only if both readings disagree; if one reading agrees, keep the agreeing one and note it
        if (firstPair === 'LOSS' && secondPair === 'LOSS') return { ...r, confirmedBy: 2 } as CheckResult;
        log(`[${c.id}] the two readings disagree with each other: marked inconclusive, never proven`);
        return { ...r, copyOk: false };
      });
    }
  } finally {
    if (copy && !o.keepCopy) {
      log(`Removing copy ${copy.project}`);
      await destroyCopy(copy).catch((e) => log(`Could not remove copy: ${(e as Error).message}`));
    }
  }

  const { verdict, differences } = compareChecks(checks);
  const credits = checks.reduce((s, c) => s + (c.liveRun?.credits ?? 0) + (c.copyRun?.credits ?? 0), 0);
  const report: ProofReport = {
    id: `proof-${stamp()}`,
    project: cfg.project,
    backupId,
    createdAt: new Date().toISOString(),
    verdict,
    differences,
    checks,
    rowCounts,
    rowCountVerdict,
    creditsUsed: credits,
  };
  const files = writeReport(join(projectDir, '.ripcord', 'reports'), report);
  if (!o.copyUrl) {
    const st = readState(projectDir);
    writeState(projectDir, { ...st, lastProof: { id: report.id, verdict, at: report.createdAt, backupId } });
  }
  log(`\n${verdict}${differences.length ? ': ' + differences.map((d) => `${d.id}.${d.key} live="${d.live}" copy="${d.copy}"`).join('; ') : ''}`);
  log(`Row counts: ${rowCountVerdict}`);
  log(`Report: ${files.html}`);
  return { report, files };
}

// verify: Kane rereads the checks on the live app only (one run per check) and compares with the live values of the last proof.
export async function verify(configPath: string, lastReport: ProofReport, log = (s: string) => console.log(s)) {
  const cfg = loadConfig(configPath);
  const vars = kaneVars(cfg);
  const results: CheckResult[] = [];
  for (const check of cfg.checks) {
    const before = lastReport.checks.find((x) => x.id === check.id);
    const run = await runKane({ objective: objectiveFor(check), url: cfg.appUrl, vars });
    log(`[${check.id}] now ${run.status} ${JSON.stringify(run.values)}`);
    const now = pick(check, run);
    const nowOk = ok(check, run);
    results.push({ id: check.id, live: before?.live ?? {}, copy: now, liveOk: !!before?.liveOk, copyOk: nowOk, copyRun: run });
  }
  return compareChecks(results);
}
