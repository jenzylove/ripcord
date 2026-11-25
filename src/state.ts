import fs from 'node:fs';
import path from 'node:path';
import type { State } from './types.js';

export function statePath(projectDir: string): string {
  return path.join(projectDir, '.ripcord', 'state.json');
}

export function readState(projectDir: string): State {
  try {
    const text = fs.readFileSync(statePath(projectDir), 'utf8');
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as State) : {};
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`cannot read ${statePath(projectDir)}: ${(e as Error).message}`);
  }
}

export function writeState(projectDir: string, state: State): void {
  const file = statePath(projectDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

export function updateState(projectDir: string, patch: Partial<State>): State {
  const next = { ...readState(projectDir), ...patch };
  writeState(projectDir, next);
  return next;
}
