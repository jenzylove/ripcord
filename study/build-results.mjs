// Builds site/data/results.json from real study outputs only: study/<app>/kane/<method>.json (Ripcord proof reports)
// and study/<app>/kane/<method>.rows.json (row counts). Nothing here is typed by hand except method labels and sources.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const apps = {
  mealie: { name: 'Mealie', version: 'v3.31.0 (Postgres 17)' },
  n8n: { name: 'n8n', version: '2.49.6 (Postgres 18)' },
  vikunja: { name: 'Vikunja', version: '2.8.0 (Postgres 18)' },
};
const methods = {
  mealie: {
    official: { label: 'Official: built in backup and restore', source: 'https://mealie.io/documentation/getting-started/usage/backups-and-restoring/' },
    community: { label: 'Common guide: pg_dump of the database', source: 'https://dev.to/dmdboi/automated-postgresql-backups-in-docker-complete-guide-with-pgdump-52a' },
    claude: { label: 'Script written by Claude Code (unsteered prompt)', source: 'https://github.com/jenzylove/ripcord/tree/master/study/mealie/methods/claude' },
  },
  n8n: {
    official: { label: 'Official: database dump plus the .n8n folder', source: 'https://docs.n8n.io/deploy/host-n8n/keep-n8n-running/backup-and-restore' },
    community: { label: 'n8n CLI export and import (CLI docs, popular guides)', source: 'https://docs.n8n.io/hosting/cli-commands/' },
  },
  vikunja: {
    official: { label: 'Official: vikunja dump and vikunja restore', source: 'https://vikunja.io/docs/cli' },
    community: { label: 'Common guide: pg_dump of the database', source: 'https://dev.to/piteradyson/postgresql-docker-backup-strategies-how-to-backup-postgresql-running-in-docker-containers-1bla' },
    claude: { label: 'Script written by Claude Code (unsteered prompt)', source: 'https://github.com/jenzylove/ripcord/tree/master/study/vikunja/methods/claude' },
  },
};
const NOISE = new Set(['sessions']); // rows created by our own API logins during checks

const cases = [];
for (const [app, ms] of Object.entries(methods)) {
  for (const [m, meta] of Object.entries(ms)) {
    const rp = `study/${app}/kane/${m}.json`;
    const rw = `study/${app}/kane/${m}.rows.json`;
    if (!existsSync(rp)) continue;
    const r = JSON.parse(readFileSync(rp, 'utf8'));
    const rows = existsSync(rw) ? JSON.parse(readFileSync(rw, 'utf8')) : null;
    const realMismatch = rows ? rows.mismatched.filter((x) => !NOISE.has(x.table)) : null;
    cases.push({
      app: apps[app].name,
      appVersion: apps[app].version,
      method: meta.label,
      methodSource: meta.source,
      rowCountVerdict: rows ? (realMismatch.length ? 'MISMATCH' : 'MATCH') : 'UNAVAILABLE',
      rowTables: rows ? rows.tables : null,
      rowMismatches: realMismatch,
      kaneVerdict: r.verdict,
      differences: r.differences.map((d) => ({ check: d.id, key: d.key, live: d.live, copy: d.copy })),
      checks: r.checks.map((c) => ({ id: c.id, live: c.live, copy: c.copy, liveShare: c.liveRun?.shareUrl ?? null, copyShare: c.copyRun?.shareUrl ?? null })),
      creditsUsed: r.creditsUsed,
      note: '',
    });
  }
}
writeFileSync('site/data/results.json', JSON.stringify({ generatedAt: new Date().toISOString(), cases }, null, 2));
console.log(`results.json: ${cases.length} cases`);
for (const c of cases) console.log(`  ${c.app} | ${c.method} | rows ${c.rowCountVerdict} | Kane ${c.kaneVerdict} | ${c.differences.map((d) => `${d.check}.${d.key}: ${d.live} -> ${d.copy}`).join('; ')}`);
