import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { KaneRun } from './types.js';

function collectValues(node: unknown, out: Record<string, string>, key?: string): void {
  if (Array.isArray(node)) {
    for (const n of node) collectValues(n, out);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const o = node as Record<string, unknown>;
  if (
    key !== undefined &&
    typeof o.syntax === 'string' &&
    o.syntax === `{{${key}}}` &&
    typeof o.value === 'string' &&
    o.type === 'memory' &&
    o.secret !== true &&
    o.value !== ''
  ) {
    out[key] = o.value;
  }
  for (const [k, v] of Object.entries(o)) collectValues(v, out, k);
}

export function parseKaneNdjson(text: string): KaneRun {
  let end: Record<string, unknown> | null = null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const obj = JSON.parse(t) as Record<string, unknown>;
      if (obj.type === 'run_end') end = obj;
    } catch {
      // a partial or non JSON line is ignored
    }
  }
  const ev = /[A-Za-z]:(?:\\\\|\\|\/)[^"\n]*?\.evidence/.exec(text) ?? /[^"\s]+\.evidence/.exec(text);
  let evidencePack: string | null = null;
  if (ev) {
    try {
      evidencePack = JSON.parse(`"${ev[0]}"`) as string; // undo JSON escaping of backslashes
    } catch {
      evidencePack = ev[0];
    }
  }
  if (!end) {
    return {
      status: 'error',
      reasonCode: 'no_run_end',
      summary: 'Kane produced no run_end event',
      values: {},
      credits: 0,
      shareUrl: null,
      sessionDir: null,
      evidencePack,
    };
  }
  const values: Record<string, string> = {};
  collectValues(end, values);
  const status = end.status === 'passed' ? 'passed' : end.status === 'failed' ? 'failed' : 'error';
  return {
    status,
    reasonCode: typeof end.reason_code === 'string' ? end.reason_code : '',
    summary: typeof end.summary === 'string' ? end.summary : '',
    values,
    credits: typeof end.credits_consumed === 'number' ? end.credits_consumed : 0,
    shareUrl: typeof end.test_url === 'string' ? end.test_url : null,
    sessionDir: typeof end.session_dir === 'string' ? end.session_dir : null,
    evidencePack,
  };
}

const LOCK = path.join(os.tmpdir(), 'ripcord-kane.lock');
const STALE_MS = 15 * 60 * 1000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function acquireLock(): Promise<() => void> {
  for (;;) {
    try {
      const fd = fs.openSync(LOCK, 'wx');
      fs.writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
      fs.closeSync(fd);
      return () => {
        try {
          fs.unlinkSync(LOCK);
        } catch {
          // already gone
        }
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      try {
        if (Date.now() - fs.statSync(LOCK).mtimeMs > STALE_MS) {
          fs.unlinkSync(LOCK);
          continue;
        }
      } catch {
        continue; // vanished between exists and stat; retry now
      }
      await sleep(2000);
    }
  }
}

// On Windows the npm shim is a .cmd; run the real script with node to avoid shell quoting of the objective.
function kaneCommand(): { cmd: string; pre: string[]; shell: boolean } {
  if (process.env.KANE_CLI_PATH) return { cmd: process.env.KANE_CLI_PATH, pre: [], shell: false };
  if (process.platform === 'win32' && process.env.APPDATA) {
    const js = path.join(process.env.APPDATA, 'npm', 'node_modules', '@testmuai', 'kane-cli', 'bin', 'kane-cli.cjs');
    if (fs.existsSync(js)) return { cmd: process.execPath, pre: [js], shell: false };
  }
  return { cmd: 'kane-cli', pre: [], shell: false };
}

export async function runKane(o: {
  objective: string;
  url: string;
  vars?: Record<string, { value: string; secret?: boolean }>;
  maxSteps?: number;
  cwd?: string;
}): Promise<KaneRun> {
  const release = await acquireLock();
  try {
    const { cmd, pre, shell } = kaneCommand();
    const args = [...pre, 'run', o.objective, '--url', o.url, '--headless', '--agent', '--max-steps', String(o.maxSteps ?? 50)];
    if (o.vars && Object.keys(o.vars).length > 0) {
      const vars: Record<string, { value: string; secret: boolean }> = {};
      for (const [k, v] of Object.entries(o.vars)) vars[k] = { value: v.value, secret: v.secret ?? false };
      args.push('--variables', JSON.stringify(vars));
    }
    return await new Promise<KaneRun>((resolve) => {
      const child = spawn(cmd, args, { cwd: o.cwd, shell, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      child.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')));
      child.stderr.on('data', (d: Buffer) => (err += d.toString('utf8')));
      child.on('error', (e) => {
        resolve({ ...parseKaneNdjson(out), status: 'error', reasonCode: 'spawn_error', summary: `could not start kane-cli: ${e.message}` });
      });
      child.on('close', (code) => {
        const run = parseKaneNdjson(out);
        if (run.reasonCode === 'no_run_end') {
          run.summary = `kane-cli exited with code ${code} and no run_end event${err ? `: ${err.trim().slice(0, 500)}` : ''}`;
        }
        resolve(run);
      });
    });
  } finally {
    release();
  }
}
