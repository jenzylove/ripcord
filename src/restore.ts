import net from 'node:net';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { parse, stringify } from 'yaml';
import type { BackupManifest, CopyStack, RipcordConfig } from './types.js';
import { compose, docker, execFromFile, sleep } from './docker.js';

// ---------- pure helpers (unit tested) ----------

/** Rewrite one compose `ports` entry so its host side becomes newHost. Entries without a host port are left alone. */
export function remapPortEntry(entry: unknown, newHost: number): { entry: unknown; oldHost: number | null } {
  if (typeof entry === 'string') {
    const [spec, proto] = entry.split('/');
    const parts = spec.split(':');
    const suffix = proto ? `/${proto}` : '';
    if (parts.length === 2 && /^\d+$/.test(parts[0])) {
      return { entry: `${newHost}:${parts[1]}${suffix}`, oldHost: Number(parts[0]) };
    }
    if (parts.length === 3 && /^\d+$/.test(parts[1])) {
      return { entry: `${parts[0]}:${newHost}:${parts[2]}${suffix}`, oldHost: Number(parts[1]) };
    }
    return { entry, oldHost: null };
  }
  if (entry && typeof entry === 'object') {
    const o = entry as Record<string, unknown>;
    if (o.published !== undefined && o.published !== null && /^\d+$/.test(String(o.published))) {
      return { entry: { ...o, published: String(newHost) }, oldHost: Number(o.published) };
    }
  }
  return { entry, oldHost: null };
}

type Doc = {
  name?: string;
  services?: Record<string, Record<string, unknown>>;
  volumes?: Record<string, Record<string, unknown> | null>;
  networks?: Record<string, Record<string, unknown> | null>;
};

/** How many host ports the compose file publishes (so the caller can find that many free ones). */
export function countPublishedPorts(composeText: string): number {
  const doc = (parse(composeText) ?? {}) as Doc;
  let n = 0;
  for (const svc of Object.values(doc.services ?? {})) {
    for (const p of (svc.ports as unknown[] | undefined) ?? []) if (remapPortEntry(p, 1).oldHost !== null) n++;
  }
  return n;
}

export interface RewriteResult { text: string; ports: Record<string, number> }

/**
 * Make a compose file safe to run next to the live stack:
 * remap every published host port (taken in order from freePorts), drop container_name, restart,
 * the top level name, and explicit volume or network names (so the copy never shares data with live).
 * `ports` maps service -> new host port (for the app service, the entry that replaced liveAppPort).
 */
export function rewriteCompose(composeText: string, o: { freePorts: number[]; appService: string; liveAppPort?: number }): RewriteResult {
  const doc = (parse(composeText) ?? {}) as Doc;
  const free = [...o.freePorts];
  const ports: Record<string, number> = {};
  delete doc.name;
  for (const [svcName, svc] of Object.entries(doc.services ?? {})) {
    delete svc.container_name;
    delete svc.restart;
    const list = svc.ports as unknown[] | undefined;
    if (!list) continue;
    svc.ports = list.map((p) => {
      const probe = remapPortEntry(p, 1);
      if (probe.oldHost === null) return p;
      const next = free.shift();
      if (next === undefined) throw new Error('not enough free ports for the copy');
      const { entry, oldHost } = remapPortEntry(p, next);
      if (ports[svcName] === undefined || (svcName === o.appService && oldHost === o.liveAppPort)) ports[svcName] = next;
      return entry;
    });
  }
  for (const section of [doc.volumes, doc.networks]) {
    for (const v of Object.values(section ?? {})) {
      if (v && typeof v === 'object') { delete v.name; delete v.external; }
    }
  }
  return { text: stringify(doc), ports };
}

/** Swap the port in a URL, keep everything else (path, query). */
export function copyUrl(appUrl: string, port: number): string {
  const u = new URL(appUrl);
  u.port = String(port);
  const s = u.toString();
  return !appUrl.endsWith('/') && u.pathname === '/' && !u.search && !u.hash ? s.slice(0, -1) : s;
}

// ---------- docker side ----------

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, () => s.close(() => resolve(true)));
  });
}

export async function findFreePorts(count: number, base: number): Promise<number[]> {
  const out: number[] = [];
  for (let p = base; out.length < count && p < 65535; p++) if (await portFree(p)) out.push(p);
  if (out.length < count) throw new Error(`could not find ${count} free ports from ${base}`);
  return out;
}

async function waitFor<T>(what: string, ms: number, fn: () => Promise<T | null>, everyMs = 2000): Promise<T> {
  const end = Date.now() + ms;
  let last = '';
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v !== null) return v;
    } catch (e) { last = (e as Error).message; }
    await sleep(everyMs);
  }
  throw new Error(`timed out waiting for ${what}${last ? `: ${last.slice(0, 300)}` : ''}`);
}

export async function restoreCopy(cfg: RipcordConfig, manifest: BackupManifest, opts: { portBase?: number } = {}): Promise<CopyStack> {
  const dir = path.join(cfg.vault, manifest.id);
  const project = `rc-copy-${manifest.id.toLowerCase()}`;
  const backedUp = await readFile(path.resolve(dir, manifest.composeFile), 'utf8');

  const need = countPublishedPorts(backedUp);
  const free = await findFreePorts(need, opts.portBase ?? 9930);
  const liveAppPort = Number(new URL(cfg.appUrl).port || (cfg.appUrl.startsWith('https') ? 443 : 80));
  const rw = rewriteCompose(backedUp, { freePorts: free, appService: cfg.appService, liveAppPort });
  const composeFile = path.join(dir, 'copy-compose.yml');
  await writeFile(composeFile, rw.text);
  const appPort = rw.ports[cfg.appService];
  if (appPort === undefined) throw new Error(`service ${cfg.appService} publishes no port in the compose file`);

  const stack: CopyStack = { project, composeFile, appUrl: copyUrl(cfg.appUrl, appPort), ports: rw.ports };

  try {
    // 1. create containers and volumes, start nothing
    await compose(project, composeFile, ['up', '--no-start']);

    // 2. volumes
    for (const f of manifest.files.filter((x) => x.kind === 'volume')) {
      const vol = f.name.replace(/^vol-/, '').replace(/\.tar$/, '');
      await docker(['run', '--rm', '-i', '-v', `${project}_${vol}:/data`, 'alpine', 'tar', '-C', '/data', '-xf', '-'], { stdinFile: path.join(dir, f.name) });
    }

    // 3. sqlite files go into the (stopped) container before the app starts
    for (const f of manifest.files.filter((x) => x.kind === 'sqlite')) {
      const db = cfg.databases.find((d) => `db-${d.service}.sqlite` === f.name);
      if (!db?.path) continue;
      await compose(project, composeFile, ['cp', path.join(dir, f.name), `${db.service}:${db.path}`]);
    }

    // 4. postgres: start only the database services, wait, restore
    const pg = cfg.databases.filter((d) => d.engine === 'postgres');
    if (pg.length) {
      await compose(project, composeFile, ['up', '-d', ...new Set(pg.map((d) => d.service))]);
      for (const db of pg) {
        const user = db.user!;
        const name = db.db!;
        await waitFor(`${db.service} to accept connections`, 120_000, async () => {
          const r = await compose(project, composeFile, ['exec', '-T', db.service, 'pg_isready', '-U', user, '-d', name], { allowFail: true });
          return r.code === 0 ? true : null;
        });
        await execFromFile(project, composeFile, db.service,
          ['pg_restore', '-U', user, '-d', name, '--clean', '--if-exists', '--no-owner'], path.join(dir, `db-${db.service}.dump`));
      }
    }

    // 5. everything up, then wait for the app
    await compose(project, composeFile, ['up', '-d']);
    await waitFor(`${stack.appUrl} to answer`, 180_000, async () => {
      const res = await fetch(stack.appUrl, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      return res.status < 500 ? res.status : null;
    });
    return stack;
  } catch (e) {
    // leave nothing running on failure
    await destroyCopy(stack).catch(() => {});
    throw e;
  }
}

/** `down -v` for a copy project only. Refuses anything else. */
export async function destroyCopy(copy: Pick<CopyStack, 'project' | 'composeFile'>): Promise<void> {
  if (!copy.project.startsWith('rc-copy-')) throw new Error(`refusing to destroy "${copy.project}": not a ripcord copy project`);
  await compose(copy.project, copy.composeFile, ['down', '-v', '--remove-orphans']);
}
