import type { CheckResult, Difference, Verdict } from './types.js';

const VULGAR: Record<string, [number, number]> = {
  '¼': [1, 4], '½': [1, 2], '¾': [3, 4],
  '⅐': [1, 7], '⅑': [1, 9], '⅒': [1, 10],
  '⅓': [1, 3], '⅔': [2, 3], '⅕': [1, 5], '⅖': [2, 5],
  '⅗': [3, 5], '⅘': [4, 5], '⅙': [1, 6], '⅚': [5, 6],
  '⅛': [1, 8], '⅜': [3, 8], '⅝': [5, 8], '⅞': [7, 8],
};
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUB = '₀₁₂₃₄₅₆₇₈₉';

function fromScript(s: string): string {
  return [...s]
    .map((c) => {
      const i = SUP.indexOf(c);
      if (i >= 0) return String(i);
      const j = SUB.indexOf(c);
      return j >= 0 ? String(j) : c;
    })
    .join('');
}

function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

export function normalise(v: string): string {
  let s = String(v).toLowerCase().trim();

  // superscript numerator / subscript denominator, with slash or fraction slash
  s = s.replace(
    new RegExp(`([${SUP}]+)\\s*[/\\u2044\\u2215]\\s*([${SUB}]+)`, 'g'),
    (_m, n: string, d: string) => ` ${fromScript(n)}/${fromScript(d)} `,
  );

  // vulgar fraction characters, with an optional whole number directly before
  const vulgarClass = Object.keys(VULGAR).join('');
  s = s.replace(new RegExp(`(\\d+)?\\s*([${vulgarClass}])`, 'g'), (_m, whole: string | undefined, ch: string) => {
    const [n, d] = VULGAR[ch];
    return ` ${whole ? whole + ' ' : ''}${n}/${d} `;
  });

  // "1 1/2", "2/3", "2⁄2": mixed or plain fractions to decimals
  s = s.replace(
    /(?<![\d./])(?:(\d+)\s+)?(\d+)\s*[/⁄∕]\s*(\d+)(?![\d/])/g,
    (m, whole: string | undefined, n: string, d: string) => {
      const den = Number(d);
      if (den === 0) return m;
      return fmt((whole ? Number(whole) : 0) + Number(n) / den);
    },
  );

  // currency symbols and thousands separators
  s = s.replace(/[$€£₦]/g, '');
  let prev: string;
  do {
    prev = s;
    s = s.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  } while (s !== prev);

  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/[.,;:!?]+$/, '').trim();
  return s;
}

/**
 * Rules:
 * - a check with liveOk=false or copyOk=false, a key missing/null on either side, or no keys at all
 *   makes the result INCONCLUSIVE, unless some trusted check shows a real difference (then LOSS).
 * - only checks with both sides ok contribute differences; a difference needs both values present.
 * - for an INCONCLUSIVE verdict, `differences` lists the missing or null values so reports can show why.
 * - never PROVEN with zero checks.
 */
export function compareChecks(results: CheckResult[]): { verdict: Verdict; differences: Difference[] } {
  const diffs: Difference[] = [];
  const gaps: Difference[] = [];
  let inconclusive = results.length === 0;

  for (const r of results) {
    const keys = [...new Set([...Object.keys(r.live), ...Object.keys(r.copy)])];
    if (keys.length === 0) inconclusive = true;
    const sideOk = r.liveOk && r.copyOk;
    if (!sideOk) inconclusive = true;
    for (const key of keys) {
      const l = r.live[key] ?? null;
      const c = r.copy[key] ?? null;
      if (l === null || c === null) {
        inconclusive = true;
        gaps.push({ id: r.id, key, live: l, copy: c });
        continue;
      }
      if (sideOk && normalise(l) !== normalise(c)) diffs.push({ id: r.id, key, live: l, copy: c });
    }
  }

  if (diffs.length > 0) return { verdict: 'LOSS', differences: diffs };
  if (inconclusive) return { verdict: 'INCONCLUSIVE', differences: gaps };
  return { verdict: 'PROVEN', differences: [] };
}
