import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKaneNdjson } from '../src/kane.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => fs.readFileSync(path.join(here, 'fixtures', n), 'utf8');

describe('parseKaneNdjson', () => {
  it('db only restore: broken photo', () => {
    const r = parseKaneNdjson(fx('kane-mealie-dbonly-restore.ndjson'));
    expect(r.status).toBe('passed');
    expect(r.values).toEqual({
      servings_yield: '6 servings',
      ingredient_count: '3',
      recipe_photo_status: 'missing or broken image placeholder',
    });
    expect(r.shareUrl).toMatch(/^https:\/\/test-manager\.lambdatest\.com\//);
    expect(r.credits).toBeGreaterThan(0);
    expect(r.sessionDir).toContain('959562f6-df4e-4d6f-8fd7-a999aaffd8d6');
    expect(r.evidencePack).toBe(
      'C:\\Users\\LENOVO\\.testmuai\\kaneai\\sessions\\959562f6-df4e-4d6f-8fd7-a999aaffd8d6\\evidence\\dda4679c-3ee2-40f7-ba1d-58736a3a8ffd.evidence',
    );
  });

  it('full restore: orange image', () => {
    const r = parseKaneNdjson(fx('kane-mealie-full-restore.ndjson'));
    expect(r.status).toBe('passed');
    expect(r.values).toEqual({
      recipe_servings_or_yield: '6 servings',
      ingredient_count: '3',
      recipe_photo_status: 'plain orange image',
    });
    expect(r.summary).toContain('Opened the Jollof Rice recipe');
  });

  it('shopping list fractions are kept verbatim', () => {
    const r = parseKaneNdjson(fx('kane-mealie-shoppinglist.ndjson'));
    expect(r.values.rice_line).toBe('2\u20443 cup rice');
    expect(r.values.salt_line).toBe('1\u20442 teaspoon salt');
    expect(r.values.tomatoes_line).toBe('6 tomatoes');
    expect(r.values.water_line).toBe('3 cup water');
  });

  it('failed run', () => {
    const r = parseKaneNdjson(fx('kane-failed-turns.ndjson'));
    expect(r.status).toBe('failed');
    expect(r.reasonCode).toBe('assertion_error.step_not_achievable');
    expect(r.values).toEqual({});
    expect(r.credits).toBeCloseTo(73.804155, 5);
    expect(r.summary).toContain('turns');
  });

  it('no run_end is an error', () => {
    const r = parseKaneNdjson('{"type":"stream_start"}\nnot json\n');
    expect(r.status).toBe('error');
    expect(r.values).toEqual({});
    expect(r.evidencePack).toBeNull();
    expect(r.shareUrl).toBeNull();
  });

  it('skips secret values', () => {
    const line = JSON.stringify({
      type: 'run_end',
      status: 'passed',
      summary: 's',
      reason_code: '',
      context: {
        variables: {
          pw: { syntax: '{{pw}}', value: 'hunter2', type: 'secret', secret: true },
          a: { syntax: '{{a}}', value: 'ok', type: 'memory', secret: false },
        },
      },
    });
    expect(parseKaneNdjson(line).values).toEqual({ a: 'ok' });
  });
});
