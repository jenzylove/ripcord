// rollback: put the last proven backup back into the live stack, then Kane checks the user's data is back.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BackupManifest, ProofReport } from './types.js';
import { loadConfig } from './config.js';
import { compose, docker, execFromFile, sleep } from './docker.js';
import { realVolumeName } from './backup.js';
import { parseCompose } from './compose.js';
import { verify } from './prove.js';

export async function rollback(configPath: string, proven: ProofReport, log = (s: string) => console.log(s)) {
  const cfg = loadConfig(configPath);
  const dir = join(cfg.vault, proven.backupId);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as BackupManifest;
  const composeText = readFileSync(cfg.composeFile, 'utf8');
  const dbServices = new Set(cfg.databases.map((d) => d.service));
  const appServices = parseCompose(composeText).services.map((s) => s.name).filter((n) => !dbServices.has(n));

  log(`Rolling back ${cfg.project} to proven backup ${manifest.id}...`);
  await compose(cfg.project, cfg.composeFile, ['stop', ...appServices]);

  for (const f of manifest.files.filter((x) => x.kind === 'volume')) {
    const vol = f.name.replace(/^vol-/, '').replace(/\.tar$/, '');
    const real = realVolumeName(composeText, cfg.project, vol);
    log(`  volume ${real}`);
    await docker(['run', '--rm', '-i', '-v', `${real}:/data`, 'alpine', 'sh', '-c', 'find /data -mindepth 1 -delete && tar -C /data -xf -'], { stdinFile: join(dir, f.name) });
  }
  for (const db of cfg.databases.filter((d) => d.engine === 'postgres')) {
    log(`  database ${db.service}`);
    await compose(cfg.project, cfg.composeFile, ['up', '-d', db.service]);
    await execFromFile(cfg.project, cfg.composeFile, db.service,
      ['pg_restore', '-U', db.user!, '-d', db.db!, '--clean', '--if-exists', '--no-owner'], join(dir, `db-${db.service}.dump`), true);
  }
  await compose(cfg.project, cfg.composeFile, ['up', '-d']);
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(cfg.appUrl, { signal: AbortSignal.timeout(5000) }); if (r.status < 500) break; } catch { /* starting */ }
    await sleep(2000);
  }
  log('Kane checks the live app against the proven state...');
  const { verdict, differences } = await verify(configPath, proven, log);
  log(verdict === 'PROVEN' ? 'ROLLED BACK: Kane sees everything from the proven state.' : `${verdict} after rollback: ${JSON.stringify(differences)}`);
  return verdict;
}
