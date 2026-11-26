// Usage: node rowcounts.mjs <app> <liveProject> <copyProject> <service> <user> <db> [<method>]
import { countRows, compareRowCounts } from '../dist/rowcount.js';
import { writeFileSync, mkdirSync } from 'node:fs';
const [app, live, copy, service, user, db, method] = process.argv.slice(2);
const compose = `${app}/docker-compose.yml`;
const spec = { service, engine: 'postgres', user, db };
const a = await countRows(live, compose, spec);
const b = await countRows(copy, compose, spec);
const rows = compareRowCounts(a, b);
const mism = rows.filter((r) => r.live !== r.copy);
const out = { app, method, tables: rows.length, mismatched: mism, verdict: mism.length ? 'MISMATCH' : 'MATCH' };
mkdirSync(`${app}/kane`, { recursive: true });
writeFileSync(`${app}/kane/${method}.rows.json`, JSON.stringify(out, null, 2));
console.log(app, method, out.verdict, rows.length, 'tables', mism.slice(0, 5));
