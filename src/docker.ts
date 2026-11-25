import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';

export interface RunResult { code: number; stdout: string; stderr: string }

export interface RunOpts {
  cwd?: string;
  /** stream this file into the command's stdin */
  stdinFile?: string;
  /** stream the command's stdout into this file (stdout string stays empty) */
  stdoutFile?: string;
  /** do not throw on a non zero exit code */
  allowFail?: boolean;
  timeoutMs?: number;
}

export class DockerError extends Error {
  constructor(public args: string[], public code: number, public stderr: string) {
    super(`docker ${args.join(' ').slice(0, 300)} failed (exit ${code}): ${stderr.trim().slice(-1500)}`);
    this.name = 'DockerError';
  }
}

export function dockerEnv(): NodeJS.ProcessEnv {
  return { ...process.env, MSYS_NO_PATHCONV: '1', MSYS2_ARG_CONV_EXCL: '*' };
}

const STDERR_CAP = 1_000_000;

/** Run `docker <args>`. Streams to/from files when asked. Throws DockerError on failure unless allowFail. */
export function docker(args: string[], opts: RunOpts = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { cwd: opts.cwd, env: dockerEnv(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout | undefined;
    let outDone: Promise<void> = Promise.resolve();

    child.stderr.on('data', (d: Buffer) => { if (stderr.length < STDERR_CAP) stderr += d.toString('utf8'); });

    if (opts.stdoutFile) {
      const ws = createWriteStream(opts.stdoutFile);
      outDone = new Promise<void>((res, rej) => { ws.on('close', () => res()); ws.on('error', rej); });
      child.stdout.pipe(ws);
    } else {
      child.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
    }

    child.stdin.on('error', () => { /* EPIPE when the command exits early; the exit code reports it */ });
    if (opts.stdinFile) {
      const rs = createReadStream(opts.stdinFile);
      rs.on('error', (e) => { child.kill(); reject(e); });
      rs.pipe(child.stdin);
    } else {
      child.stdin.end();
    }

    if (opts.timeoutMs) timer = setTimeout(() => child.kill(), opts.timeoutMs);

    child.on('error', (e) => { if (timer) clearTimeout(timer); reject(new Error(`could not start docker: ${e.message}`)); });
    child.on('close', async (code) => {
      if (timer) clearTimeout(timer);
      try { await outDone; } catch (e) { return reject(e); }
      const res = { code: code ?? -1, stdout, stderr };
      if (res.code !== 0 && !opts.allowFail) return reject(new DockerError(args, res.code, stderr));
      resolve(res);
    });
  });
}

/** Run `docker compose -p <project> -f <file> <args>`. */
export function compose(project: string, composeFile: string, args: string[], opts: RunOpts = {}): Promise<RunResult> {
  return docker(['compose', '-p', project, '-f', composeFile, ...args], opts);
}

/** Run a command in a running service container and stream its stdout into a file. */
export function execToFile(project: string, composeFile: string, service: string, cmd: string[], outFile: string): Promise<RunResult> {
  return compose(project, composeFile, ['exec', '-T', service, ...cmd], { stdoutFile: outFile });
}

/** Run a command in a running service container, streaming a file into its stdin. */
export function execFromFile(project: string, composeFile: string, service: string, cmd: string[], inFile: string, allowFail = false): Promise<RunResult> {
  return compose(project, composeFile, ['exec', '-T', service, ...cmd], { stdinFile: inFile, allowFail });
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
