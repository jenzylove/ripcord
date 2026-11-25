// Writes the proof report as JSON and as one static HTML page.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProofReport } from './types.js';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const verdictText: Record<string, string> = {
  PROVEN: 'Proven: a user would find everything after a restore.',
  LOSS: 'Loss: a user would notice something missing after a restore.',
  INCONCLUSIVE: 'Inconclusive: Kane could not read every value, so nothing is claimed.',
};

export function renderHtml(r: ProofReport): string {
  const rows = r.checks
    .map((c) => {
      const keys = Object.keys({ ...c.live, ...c.copy });
      return keys
        .map((k) => {
          const diff = r.differences.some((d) => d.id === c.id && d.key === k);
          return `<tr class="${diff ? 'diff' : ''}"><td>${esc(c.id)}</td><td>${esc(k)}</td><td>${esc(c.live[k] ?? '(not read)')}</td><td>${esc(c.copy[k] ?? '(not read)')}</td><td>${
            c.liveRun?.shareUrl ? `<a href="${esc(c.liveRun.shareUrl)}">live run</a>` : ''
          } ${c.copyRun?.shareUrl ? `<a href="${esc(c.copyRun.shareUrl)}">copy run</a>` : ''}</td></tr>`;
        })
        .join('');
    })
    .join('');
  const counts = r.rowCounts
    .map((t) => `<tr class="${t.live !== t.copy ? 'diff' : ''}"><td>${esc(t.table)}</td><td>${t.live}</td><td>${t.copy}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ripcord proof ${esc(r.id)}</title>
<style>
:root{--bg:#f6f5f1;--fg:#17171a;--mute:#6b6b70;--line:#dddbd3;--bad:#b3261e;--good:#1f6f43}
@media (prefers-color-scheme:dark){:root{--bg:#121214;--fg:#ececee;--mute:#9a9aa2;--line:#2b2b30;--bad:#ff8a80;--good:#7ee2a8}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 ui-sans-serif,system-ui,sans-serif}
main{max-width:960px;margin:0 auto;padding:32px 16px}
h1{font-size:28px;margin:0 0 4px}.v{font-size:20px;font-weight:600}.PROVEN{color:var(--good)}.LOSS{color:var(--bad)}.INCONCLUSIVE{color:var(--mute)}
table{width:100%;border-collapse:collapse;margin:16px 0 32px;font-size:14px}td,th{border-bottom:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}
tr.diff td{color:var(--bad);font-weight:600}.m{color:var(--mute);font-size:14px}a{color:inherit}
</style></head><body><main>
<h1>Ripcord proof</h1>
<p class="m">${esc(r.project)} · backup ${esc(r.backupId)} · ${esc(r.createdAt)} · ${r.creditsUsed.toFixed(1)} Kane credits</p>
<p class="v ${r.verdict}">${esc(verdictText[r.verdict])}</p>
<h2>What Kane read, live app against restored copy</h2>
<table><thead><tr><th>Check</th><th>Value</th><th>Live</th><th>Restored copy</th><th>Kane runs</th></tr></thead><tbody>${rows}</tbody></table>
<h2>What a row count would say: ${esc(r.rowCountVerdict)}</h2>
<table><thead><tr><th>Table</th><th>Live rows</th><th>Copy rows</th></tr></thead><tbody>${counts || '<tr><td colspan="3">not available</td></tr>'}</tbody></table>
</main></body></html>`;
}

export function writeReport(dir: string, r: ProofReport): { json: string; html: string } {
  mkdirSync(dir, { recursive: true });
  const json = join(dir, `${r.id}.json`);
  const html = join(dir, `${r.id}.html`);
  const slim = { ...r, checks: r.checks.map(({ liveRun, copyRun, ...c }) => ({ ...c, liveRun: liveRun && { ...liveRun }, copyRun: copyRun && { ...copyRun } })) };
  writeFileSync(json, JSON.stringify(slim, null, 2));
  writeFileSync(html, renderHtml(r));
  return { json, html };
}
