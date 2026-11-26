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
  const parts = [check.ask.trim()];
  if (check.read.length) parts.push(`Save the answers into these variables: ${check.read.map((k) => `{{${k}}}`).join(', ')}.`);
  if (check.assert) parts.push(`Finally verify this and fail the test if it is not true: ${check.assert}`);
  return parts.join(' ');
}

/** Keys compared for a check: its read values, plus 'assert' when the check has an assertion. */
export function keysFor(check: Check): string[] {
  return check.assert ? [...check.read, 'assert'] : check.read;
}

/** The assertion outcome as a value: PASS, FAIL (Kane's check failed), or null (the run failed for another reason, so nothing is known). */
export function assertValue(run: KaneRun): string | null {
  if (run.status === 'passed') return 'PASS';
  if (run.reasonCode.startsWith('assertion_error.') && run.reasonCode !== 'assertion_error.step_not_achievable') return 'FAIL';
  return null;
}

export function pick(check: Check, run: KaneRun): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const k of check.read) {
    const v = run.values[k];
    out[k] = v === undefined || v === null || v === '' ? null : v;
  }
  if (check.assert) out.assert = assertValue(run);
  return out;
}

export function ok(check: Check, run: KaneRun): boolean {
  const v = pick(check, run);
  if (check.assert) return v.assert !== null && check.read.every((k) => v[k] !== null);
  if (run.status !== 'passed') return false;
  return check.read.every((k) => v[k] !== null);
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
      live: pick(check, liveRun),
      copy: pick(check, copyRun),
      // an assertion only counts if it holds on the live app; a FAIL on live means the check itself is not trustworthy
      liveOk: ok(check, liveRun) && (!check.assert || assertValue(liveRun) === 'PASS'),
      copyOk: ok(check, copyRun),
      liveRun,
      copyRun,
    });
  }
  return results;
}
