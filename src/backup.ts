import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, rename, stat, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import type { BackupManifest, RipcordConfig } from './types.js';
import { docker, execToFile } from './docker.js';

export function backupId(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/** Real docker volume name: explicit `name:` in the compose file, else <project>_<volume>. */
export function realVolumeName(composeText: string, project: string, volume: string): string {
  const doc = (parse(composeText) ?? {}) as { volumes?: Record<string, { name?: string } | null> };
  const explicit = doc.volumes?.[volume]?.name;
  return explicit ?? `${project}_${volume}`;
}

/** Named volumes that hold postgres data. They are restored by pg_restore, never by a hot file copy. */
export function postgresDataVolumes(composeText: string, cfg: Pick<RipcordConfig, 'databases'>): Set<string> {
  const doc = (parse(composeText) ?? {}) as { services?: Record<string, { volumes?: unknown[] }> };
  const out = new Set<string>();
  for (const db of cfg.databases) {
    if (db.engine !== 'postgres') continue;
    for (const v of doc.services?.[db.service]?.volumes ?? []) {
      if (typeof v === 'string') {
        const [src, dst] = v.split(':');
        if (dst && dst.startsWith('/var/lib/postgresql')) out.add(src);
      } else if (v && typeof v === 'object') {
        const o = v as { source?: string; target?: string };
        if (o.source && o.target?.startsWith('/var/lib/postgresql')) out.add(o.source);
      }
    }
  }
  return out;
}

async function fileInfo(file: string): Promise<{ bytes: number; sha256: string }> {
  const h = createHash('sha256');
  await new Promise<void>((res, rej) => {
    const s = createReadStream(file);
    s.on('data', (d) => h.update(d));
    s.on('end', () => res());
    s.on('error', rej);
  });
  return { bytes: (await stat(file)).size, sha256: h.digest('hex') };
}

export async function createBackup(cfg: RipcordConfig, opts: { cwd?: string } = {}): Promise<BackupManifest> {
  const composePath = path.resolve(opts.cwd ?? process.cwd(), cfg.composeFile);
  const composeText = await readFile(composePath, 'utf8');
  const id = backupId();
  const finalDir = path.join(cfg.vault, id);
  const dir = `${finalDir}.partial`;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const files: BackupManifest['files'] = [];
  const add = async (name: string, kind: 'pg_dump' | 'sqlite' | 'volume', source: string) => {
    files.push({ name, kind, source, ...(await fileInfo(path.join(dir, name))) });
  };

  try {
    for (const db of cfg.databases) {
      if (db.engine === 'postgres') {
        if (!db.user || !db.db) throw new Error(`postgres database ${db.service} needs user and db`);
        const name = `db-${db.service}.dump`;
        await execToFile(cfg.project, composePath, db.service, ['pg_dump', '-U', db.user, '-d', db.db, '-Fc'], path.join(dir, name));
        await add(name, 'pg_dump', `${db.service}:${db.db}`);
      } else {
        if (!db.path) throw new Error(`sqlite database ${db.service} needs path`);
        const name = `db-${db.service}.sqlite`;
        await execToFile(cfg.project, composePath, db.service, ['cat', db.path], path.join(dir, name));
        await add(name, 'sqlite', `${db.service}:${db.path}`);
      }
    }

    const skip = postgresDataVolumes(composeText, cfg);
    for (const vol of cfg.volumes) {
      if (skip.has(vol)) {
        console.warn(`ripcord: skipping volume ${vol}: it holds postgres data, which is backed up with pg_dump`);
        continue;
      }
      const real = realVolumeName(composeText, cfg.project, vol);
      const name = `vol-${vol}.tar`;
      await docker(['run', '--rm', '-v', `${real}:/data:ro`, 'alpine', 'tar', '-C', '/data', '-cf', '-', '.'], { stdoutFile: path.join(dir, name) });
      await add(name, 'volume', real);
    }

    await copyFile(composePath, path.join(dir, 'docker-compose.yml'));
    const manifest: BackupManifest = {
      id, project: cfg.project, createdAt: new Date().toISOString(), composeFile: 'docker-compose.yml', files,
    };
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await rename(dir, finalDir);
    return manifest;
  } catch (e) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}
