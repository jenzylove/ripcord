// Manual smoke test of the Docker engine against the live Mealie spike stack.
// Build first: npx tsc -p scripts/tsconfig.engine.json   (or npx tsc -p tsconfig.json and change the import to ../dist)
// Run: node scripts/engine-smoke.mjs
import { createBackup } from '../dist-engine/backup.js';
import { restoreCopy, destroyCopy } from '../dist-engine/restore.js';
import { countRows, compareRowCounts } from '../dist-engine/rowcount.js';

const composeFile = 'C:\\Users\\LENOVO\\AppData\\Local\\Temp\\claude\\59f50460aba3ffef\\c2794cce-0ddc-46b3-875e-81ebbfc88523\\scratchpad\\ripcord-spike\\live\\docker-compose.yml';
const pgdb = { service: 'postgres', engine: 'postgres', user: 'mealie', db: 'mealie' };
const cfg = {
  project: 'rclive',
  composeFile,
  appUrl: 'http://localhost:9925',
  appService: 'mealie',
  loginVars: {},
  databases: [pgdb],
  volumes: ['mealie-data', 'mealie-pgdata'], // pgdata is skipped automatically (pg_dump covers it)
  vault: 'C:\\Users\\LENOVO\\ripcord\\vault',
  checks: [],
};

let copy;
try {
  const t0 = Date.now();
  const manifest = await createBackup(cfg);
  console.log('backup id:', manifest.id);
  for (const f of manifest.files) console.log(`  ${f.name}  ${f.kind}  ${f.bytes} bytes  sha256 ${f.sha256.slice(0, 16)}...`);

  copy = await restoreCopy(cfg, manifest, { portBase: 9930 });
  console.log('copy project:', copy.project, 'ports:', JSON.stringify(copy.ports), 'url:', copy.appUrl);

  const res = await fetch(`${copy.appUrl}/api/app/about`);
  console.log(`GET ${copy.appUrl}/api/app/about ->`, res.status, (await res.text()).slice(0, 120));

  const live = await countRows(cfg.project, composeFile, pgdb);
  const cp = await countRows(copy.project, copy.composeFile, pgdb);
  const rows = compareRowCounts(live, cp);
  const bad = rows.filter((r) => r.live !== r.copy);
  console.log(`row counts: ${rows.length} tables, ${bad.length} mismatched`);
  for (const r of rows) console.log(`  ${r.table.padEnd(40)} live ${String(r.live).padStart(6)}  copy ${String(r.copy).padStart(6)}  ${r.live === r.copy ? 'ok' : 'MISMATCH'}`);
  console.log(`elapsed ${Math.round((Date.now() - t0) / 1000)}s`);
  if (res.status !== 200 || bad.length) process.exitCode = 1;
} catch (e) {
  console.error('SMOKE FAILED:', e);
  process.exitCode = 1;
} finally {
  if (copy) {
    await destroyCopy(copy);
    console.log('destroyed', copy.project);
  }
}
