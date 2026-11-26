import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertValue, objectiveFor, pick, ok } from '../src/fingerprint.js';
import { parseKaneNdjson } from '../src/kane.js';
import type { Check, KaneRun } from '../src/types.js';

const run = (f: string) => parseKaneNdjson(readFileSync(`test/fixtures/${f}`, 'utf8'));
const fake = (status: KaneRun['status'], reasonCode: string): KaneRun => ({ status, reasonCode, summary: '', values: {}, credits: 0, shareUrl: null, sessionDir: null, evidencePack: null });
const check: Check = { id: 'photo', ask: 'Open the recipe.', read: [], assert: 'the photo shows food' };

describe('assertion checks', () => {
  it('a passed run is PASS', () => expect(assertValue(run('kane-mealie-full-restore.ndjson'))).toBe('PASS'));
  it('a failed checkpoint is FAIL', () => expect(assertValue(fake('failed', 'assertion_error.checkpoint_failed'))).toBe('FAIL'));
  it('a run that could not do its steps is unknown, never FAIL', () => {
    expect(assertValue(run('kane-failed-turns.ndjson'))).toBe(null);
    expect(assertValue(fake('failed', 'agent_error.ap_no_action'))).toBe(null);
  });
  it('objective ends with the assertion', () => expect(objectiveFor(check)).toMatch(/fail the test if it is not true: the photo shows food$/));
  it('ok only when the assertion outcome is known', () => {
    expect(ok(check, fake('failed', 'assertion_error.checkpoint_failed'))).toBe(true);
    expect(ok(check, fake('failed', 'blocker.captcha'))).toBe(false);
    expect(pick(check, fake('passed', 'success.complete'))).toEqual({ assert: 'PASS' });
  });
});
