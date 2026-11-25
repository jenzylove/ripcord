import type { DatabaseSpec, RowCount } from './types.js';
import { compose } from './docker.js';

// One query, exact counts (query_to_xml runs a real count(*) per table) for every base table in schema public.
const SQL =
  "select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text " +
  "from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1";

export async function countRows(project: string, composeFile: string, db: DatabaseSpec): Promise<Record<string, number>> {
  if (db.engine !== 'postgres') throw new Error(`row counts are only implemented for postgres, got ${db.engine}`);
  if (!db.user || !db.db) throw new Error('postgres database spec needs user and db');
  const r = await compose(project, composeFile, ['exec', '-T', db.service, 'psql', '-U', db.user, '-d', db.db, '-At', '-F', '\t', '-c', SQL]);
  return parseCounts(r.stdout);
}

export function parseCounts(out: string): Record<string, number> {
  const res: Record<string, number> = {};
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [t, n] = line.split('\t');
    const v = Number(n);
    if (!t || !Number.isFinite(v)) throw new Error(`unexpected psql row: ${line}`);
    res[t] = v;
  }
  return res;
}

/** A table missing on one side is reported as -1 so it never matches. */
export function compareRowCounts(live: Record<string, number>, copy: Record<string, number>): RowCount[] {
  const tables = [...new Set([...Object.keys(live), ...Object.keys(copy)])].sort();
  return tables.map((table) => ({ table, live: live[table] ?? -1, copy: copy[table] ?? -1 }));
}
