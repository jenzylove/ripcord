import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readState, writeState, updateState, statePath } from '../src/state.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rc-state-'));

describe('state', () => {
  it('missing file is {}', () => {
    expect(readState(tmp())).toEqual({});
  });
  it('writes and reads, creating .ripcord', () => {
    const d = tmp();
    const s = { lastBackup: { id: 'B1', at: '2026-11-25T00:00:00Z' } };
    writeState(d, s);
    expect(statePath(d)).toBe(path.join(d, '.ripcord', 'state.json'));
    expect(fs.existsSync(statePath(d))).toBe(true);
    expect(readState(d)).toEqual(s);
  });
  it('update merges', () => {
    const d = tmp();
    writeState(d, { lastBackup: { id: 'B1', at: 'x' } });
    updateState(d, { lastProof: { id: 'P', verdict: 'PROVEN', at: 'y', backupId: 'B1' } });
    expect(readState(d).lastBackup?.id).toBe('B1');
    expect(readState(d).lastProof?.verdict).toBe('PROVEN');
  });
  it('corrupt file throws a clear error', () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, '.ripcord'));
    fs.writeFileSync(statePath(d), '{nope');
    expect(() => readState(d)).toThrow(/state\.json/);
  });
});
