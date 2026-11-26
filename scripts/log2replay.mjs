// Usage: node scripts/log2replay.mjs <name> <title> <recordedAt> <command> <logfile> [more: <command> <logfile> ...]
// Turns real Ripcord logs into site/runs/<name>.json for replay.html and copies the raw logs to site/logs/.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { basename } from 'node:path';
const [name, title, recordedAt, ...rest] = process.argv.slice(2);
const lines = []; const logs = [];
for (let i = 0; i < rest.length; i += 2) {
  const cmd = rest[i]; const file = rest[i + 1];
  const raw = readFileSync(file, 'utf8').replace(/\r/g, '');
  const dst = `${name}-${i / 2 + 1}-${basename(file)}`; copyFileSync(file, `site/logs/${dst}`); logs.push(`logs/${dst}`);
  lines.push({ text: `$ ${cmd}`, wait: 700 });
  for (const t of raw.split('\n')) {
    if (!t.trim() || /DeprecationWarning|trace-deprecation|^exit \d|^fix exit/.test(t)) continue;
    const wait = /^\[.*\] (live|copy) +http/.test(t) ? 1100 : /passed|failed/.test(t) ? 500 : /^(PROVEN|LOSS|INCONCLUSIVE|ROLLED)/.test(t) ? 900 : 350;
    lines.push({ text: t.split('C:'+String.fromCharCode(92)+'Users'+String.fromCharCode(92)+'LENOVO'+String.fromCharCode(92)+'ripcord'+String.fromCharCode(92)).join('').split('C:/Users/LENOVO/ripcord/').join(''), wait });
  }
}
writeFileSync(`site/runs/${name}.json`, JSON.stringify({ title, recordedAt, fullLog: logs[0], lines }, null, 2));
console.log(`site/runs/${name}.json: ${lines.length} lines`);
