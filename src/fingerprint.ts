// Runs every plain English check on the live app and on the restored copy, one Kane run at a time.
import type { Check, CheckResult, KaneRun } from './types.js';
import { runKane } from './kane.js';

export interface FingerprintOptions {
  liveUrl: string;
  copyUrl: string;
  vars: Record<string, { value: string; secret?: boolean }>;
  maxSteps?: number;
  log?: (line: string) => void;
}

// Kane is told the exact names to report so the values come back as memory entries we can read.
export function objectiveFor(check: Check): string {
  const names = check.read.map((k) => `{{${k}}}`).join(', ');
  return `${check.ask.trim()} Save the answers into these variables: ${names}.`;
}

function pick(run: KaneRun, keys: string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const k of keys) {
    const v = run.values[k];
    out[k] = v === undefined || v === null || v === '' ? null : v;
  }
  return out;
}

function ok(run: KaneRun, keys: string[]): boolean {
  if (run.status !== 'passed') return false;
  return keys.every((k) => typeof run.values[k] === 'string' && run.values[k].length > 0);
}

export async function runChecks(checks: Check[], o: FingerprintOptions): Promise<CheckResult[]> {
  const log = o.log ?? (() => {});
  const results: CheckResult[] = [];
  for (const check of checks) {
    const objective = objectiveFor(check);
    log(`[${check.id}] live  ${o.liveUrl}`);
    const liveRun = await runKane({ objective, url: o.liveUrl, vars: o.vars, maxSteps: o.maxSteps });
    log(`[${check.id}] live  ${liveRun.status} ${JSON.stringify(liveRun.values)}`);
    log(`[${check.id}] copy  ${o.copyUrl}`);
    const copyRun = await runKane({ objective, url: o.copyUrl, vars: o.vars, maxSteps: o.maxSteps });
    log(`[${check.id}] copy  ${copyRun.status} ${JSON.stringify(copyRun.values)}`);
    results.push({
      id: check.id,
      live: pick(liveRun, check.read),
      copy: pick(copyRun, check.read),
      liveOk: ok(liveRun, check.read),
      copyOk: ok(copyRun, check.read),
      liveRun,
      copyRun,
    });
  }
  return results;
}
