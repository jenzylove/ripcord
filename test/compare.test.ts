import { describe, it, expect } from 'vitest';
import { normalise, compareChecks } from '../src/compare.js';
import type { CheckResult } from '../src/types.js';

const mk = (
  id: string,
  live: Record<string, string | null>,
  copy: Record<string, string | null>,
  liveOk = true,
  copyOk = true,
): CheckResult => ({ id, live, copy, liveOk, copyOk });

describe('normalise', () => {
  it('basics', () => {
    expect(normalise('  Hello   WORLD. ')).toBe('hello world');
    expect(normalise('Done!!')).toBe('done');
  });
  it('vulgar fractions', () => {
    expect(normalise('⅓ cup')).toBe('0.333 cup');
    expect(normalise('¼ tsp')).toBe('0.25 tsp');
    expect(normalise('½')).toBe('0.5');
    expect(normalise('¾ cup')).toBe('0.75 cup');
    expect(normalise('1½ cup')).toBe('1.5 cup');
  });
  it('superscript/subscript and fraction slash', () => {
    expect(normalise('1 ¹/₂ cup')).toBe('1.5 cup');
    expect(normalise('¹/₃')).toBe('0.333');
    expect(normalise('2⁄3 cup rice')).toBe('0.667 cup rice');
    expect(normalise('1 1⁄2 teaspoon salt')).toBe('1.5 teaspoon salt');
  });
  it('same value written differently matches', () => {
    expect(normalise('⅔ cup rice')).toBe(normalise('2⁄3 cup rice'));
    expect(normalise('1/3')).toBe(normalise('⅓'));
  });
  it('currency and thousands separators', () => {
    expect(normalise('$1,234.50')).toBe('1234.50');
    expect(normalise('₦5,000,000')).toBe('5000000');
    expect(normalise('€10')).toBe('10');
    expect(normalise('£1,000')).toBe('1000');
  });
  it('keeps unrelated text', () => {
    expect(normalise('6 servings')).toBe('6 servings');
    expect(normalise('plain orange image')).toBe('plain orange image');
  });
});

describe('compareChecks', () => {
  it('PROVEN when normalised values match', () => {
    const r = compareChecks([mk('c', { a: '⅓ cup', b: '$1,000' }, { a: '1/3 cup', b: '1000' })]);
    expect(r).toEqual({ verdict: 'PROVEN', differences: [] });
  });
  it('never PROVEN with zero checks', () => {
    expect(compareChecks([]).verdict).toBe('INCONCLUSIVE');
  });
  it('never PROVEN with a check that has no keys', () => {
    expect(compareChecks([mk('c', {}, {})]).verdict).toBe('INCONCLUSIVE');
  });
  it('LOSS with a difference per key', () => {
    const r = compareChecks([
      mk('recipe', { photo: 'plain orange image', n: '3' }, { photo: 'missing or broken image placeholder', n: '4' }),
    ]);
    expect(r.verdict).toBe('LOSS');
    expect(r.differences).toEqual([
      { id: 'recipe', key: 'photo', live: 'plain orange image', copy: 'missing or broken image placeholder' },
      { id: 'recipe', key: 'n', live: '3', copy: '4' },
    ]);
  });
  it('INCONCLUSIVE when a key is missing', () => {
    const r = compareChecks([mk('c', { a: '1', b: '2' }, { a: '1' })]);
    expect(r.verdict).toBe('INCONCLUSIVE');
    expect(r.differences).toEqual([{ id: 'c', key: 'b', live: '2', copy: null }]);
  });
  it('INCONCLUSIVE when a value is null', () => {
    expect(compareChecks([mk('c', { a: null }, { a: null })]).verdict).toBe('INCONCLUSIVE');
  });
  it('INCONCLUSIVE when copy run failed', () => {
    expect(compareChecks([mk('c', { a: '1' }, { a: '1' }, true, false)]).verdict).toBe('INCONCLUSIVE');
  });
  it('INCONCLUSIVE when live run failed', () => {
    expect(compareChecks([mk('c', { a: '1' }, { a: '1' }, false, true)]).verdict).toBe('INCONCLUSIVE');
  });
  it('LOSS wins over another inconclusive check', () => {
    const r = compareChecks([mk('x', { a: '1' }, { a: '2' }), mk('y', { a: null }, { a: '1' }, true, false)]);
    expect(r.verdict).toBe('LOSS');
    expect(r.differences).toHaveLength(1);
  });
  it('a failed check does not produce a LOSS from untrusted values', () => {
    expect(compareChecks([mk('x', { a: '1' }, { a: '2' }, true, false)]).verdict).toBe('INCONCLUSIVE');
  });
  it('one proven check plus one inconclusive is INCONCLUSIVE', () => {
    expect(compareChecks([mk('x', { a: '1' }, { a: '1' }), mk('y', { a: '1' }, { a: null })]).verdict).toBe(
      'INCONCLUSIVE',
    );
  });
});

import { sameValue } from '../src/compare.js';
describe('sameValue', () => {
  it('treats a bare number and the same number with a unit as equal', () => {
    expect(sameValue('6', '6 servings')).toBe(true);
    expect(sameValue('3', '3 ingredients')).toBe(true);
  });
  it('keeps different numbers different', () => {
    expect(sameValue('6', '12 servings')).toBe(false);
    expect(sameValue('2 results', '0 results')).toBe(false);
  });
  it('keeps different words different', () => {
    expect(sameValue('real picture', 'missing')).toBe(false);
  });
});

import { polarity } from '../src/compare.js';
describe('polarity of presence answers', () => {
  it('reads Kane wordings as present or absent', () => {
    for (const v of ['photo of food', 'present', 'PHOTO', 'loaded', 'food', 'real picture', 'OPENS', 'IN', 'PREVIEW']) expect(polarity(v)).toBe('present');
    for (const v of ['No', 'missing', 'PLACEHOLDER', 'missing or broken image placeholder', 'ERROR', 'REJECTED', 'none']) expect(polarity(v)).toBe('absent');
  });
  it('leaves numbers and other text alone', () => {
    expect(polarity('6 servings')).toBe(null);
    expect(polarity('Weekly report digest')).toBe(null);
  });
  it('makes different wordings of the same answer agree', () => {
    expect(sameValue('present', 'photo of food', 'photo_state')).toBe(true);
    expect(sameValue('food', 'loaded', 'assert')).toBe(true);
    expect(sameValue('present', 'No', 'photo_status')).toBe(false);
    // never for titles or names
    expect(sameValue('Empty Bowl Soup', 'Broken Heart Pie', 'title')).toBe(false);
    expect(sameValue('Food Truck Tacos', 'Photo Booth Pasta', 'recipe_name')).toBe(false);
  });
});
