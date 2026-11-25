import { describe, it, expect } from 'vitest';
import { classifyCommand, guardDecision } from '../src/hook.js';
import type { State } from '../src/types.js';

const VAULT = 'C:\\Users\\LENOVO\\.ripcord-vault\\mealie';

const destructive = [
  'psql -U app -c "DROP TABLE users"',
  'psql -c "drop database app"',
  'psql -c "DROP SCHEMA public CASCADE"',
  'docker exec db psql -U postgres -c "TRUNCATE recipes"',
  'sqlite3 app.db "DELETE FROM recipes"',
  'psql -c "DELETE FROM recipes;"',
  'npx prisma migrate reset',
  'npx prisma migrate reset --force',
  'npx prisma db push --accept-data-loss',
  'npx prisma db push --force-reset',
  'npx drizzle-kit push --force',
  'supabase db reset',
  'bin/rails db:drop',
  'rails db:reset',
  'rake db:schema:load',
  'python manage.py flush --no-input',
  'docker compose down -v',
  'docker compose -p rclive down --volumes',
  'docker-compose down -v --remove-orphans',
  'docker volume rm rclive_mealie-data',
  'docker volume prune -f',
  'docker system prune -a --volumes',
  'rm -rf ./data',
  'rm -rf /var/lib/pgdata',
  'rm -rf ./uploads',
  'rm -rf volumes/db',
  'rm -rf C:/Users/LENOVO/.ripcord-vault/mealie',
  'railway volume delete',
  'dropdb app',
  'cd app && docker compose down -v',
];

const allowed = [
  'psql -c "SELECT * FROM users"',
  'psql -c "DELETE FROM recipes WHERE id = 5"',
  'psql -c "delete from recipes where slug = \'x\'"',
  'docker compose down',
  'docker compose up -d',
  'rm -rf node_modules',
  'rm -rf dist .next build',
  'rm -rf .next',
  'git status',
  'git commit -m "drop table support"',
  'git checkout -- data.txt',
  'npm run build',
  'npm install',
  'ls -la',
  'docker volume ls',
];

describe('classifyCommand destructive', () => {
  for (const c of destructive) {
    it(`blocks: ${c}`, () => {
      const r = classifyCommand(c, VAULT);
      expect(r.destructive).toBe(true);
      expect(r.reason).not.toBe('');
    });
  }
  it('is case insensitive', () => {
    expect(classifyCommand('PSQL -C "Drop Table X"', VAULT).destructive).toBe(true);
    expect(classifyCommand('DOCKER COMPOSE DOWN -V', VAULT).destructive).toBe(true);
  });
});

describe('classifyCommand allowed', () => {
  for (const c of allowed) {
    it(`allows: ${c}`, () => {
      const r = classifyCommand(c, VAULT);
      expect(r.destructive).toBe(false);
      expect(r.touchesVault).toBe(false);
    });
  }
});

describe('vault detection', () => {
  it('backslash, forward slash and case', () => {
    expect(classifyCommand('ls C:\\Users\\LENOVO\\.ripcord-vault\\mealie', VAULT).touchesVault).toBe(true);
    expect(classifyCommand('ls c:/users/lenovo/.ripcord-vault/mealie/x', VAULT).touchesVault).toBe(true);
    expect(classifyCommand('cat /C:/USERS/LENOVO/.RIPCORD-VAULT/MEALIE/a', VAULT).touchesVault).toBe(true);
  });
  it('other paths do not touch it', () => {
    expect(classifyCommand('ls C:/Users/LENOVO/projects', VAULT).touchesVault).toBe(false);
  });
});

const NOW = new Date('2026-11-25T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const good: State = {
  lastBackup: { id: 'B1', at: hoursAgo(2) },
  lastProof: { id: 'P1', verdict: 'PROVEN', at: hoursAgo(1), backupId: 'B1' },
};
const risky = classifyCommand('docker compose down -v', VAULT);
const safe = classifyCommand('ls', VAULT);

describe('guardDecision', () => {
  it('allows non destructive', () => {
    expect(guardDecision(safe, {}, NOW).allow).toBe(true);
  });
  it('never allows vault access, even with a proof', () => {
    const c = classifyCommand('rm -rf C:/Users/LENOVO/.ripcord-vault/mealie', VAULT);
    expect(guardDecision(c, good, NOW).allow).toBe(false);
    const read = classifyCommand('cat C:/Users/LENOVO/.ripcord-vault/mealie/manifest.json', VAULT);
    expect(guardDecision(read, good, NOW).allow).toBe(false);
  });
  it('blocks with no backup', () => {
    const d = guardDecision(risky, {}, NOW);
    expect(d.allow).toBe(false);
    expect(d.message).toContain('ripcord prove');
  });
  it('blocks with no proof', () => {
    const d = guardDecision(risky, { lastBackup: good.lastBackup }, NOW);
    expect(d.allow).toBe(false);
    expect(d.message).toContain('`ripcord prove`');
  });
  it('blocks a LOSS proof', () => {
    const d = guardDecision(risky, { ...good, lastProof: { ...good.lastProof!, verdict: 'LOSS' } }, NOW);
    expect(d.allow).toBe(false);
    expect(d.message).toContain('LOSS');
    expect(d.message).toContain('ripcord prove');
  });
  it('blocks an INCONCLUSIVE proof', () => {
    const p = { ...good.lastProof!, verdict: 'INCONCLUSIVE' as const };
    expect(guardDecision(risky, { ...good, lastProof: p }, NOW).allow).toBe(false);
  });
  it('blocks when proof is for an older backup', () => {
    const d = guardDecision(risky, { ...good, lastBackup: { id: 'B2', at: hoursAgo(0.5) } }, NOW);
    expect(d.allow).toBe(false);
    expect(d.message).toContain('ripcord prove');
  });
  it('blocks a stale proof', () => {
    const d = guardDecision(risky, { ...good, lastProof: { ...good.lastProof!, at: hoursAgo(25) } }, NOW);
    expect(d.allow).toBe(false);
    expect(d.message).toContain('ripcord prove');
  });
  it('maxProofAgeHours option', () => {
    expect(guardDecision(risky, good, NOW, { maxProofAgeHours: 0.5 }).allow).toBe(false);
    const old = { ...good, lastProof: { ...good.lastProof!, at: hoursAgo(30) } };
    expect(guardDecision(risky, old, NOW, { maxProofAgeHours: 48 }).allow).toBe(true);
  });
  it('allows destructive with a fresh matching PROVEN', () => {
    expect(guardDecision(risky, good, NOW).allow).toBe(true);
  });
});
