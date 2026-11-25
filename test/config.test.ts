import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, writeConfig, defaultVault } from '../src/config.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rc-cfg-'));
function write(yml: string) {
  const d = tmp();
  const f = path.join(d, 'ripcord.yml');
  fs.writeFileSync(f, yml);
  return { d, f };
}

const BASE = `project: rclive
composeFile: ./stack/docker-compose.yml
appUrl: http://localhost:9925
appService: mealie
loginVars:
  email: MEALIE_EMAIL
databases:
  - service: postgres
    engine: postgres
    user: mealie
    db: mealie
volumes: [mealie-data]
checks:
  - id: recipe
    ask: Open the recipe and report values
    read: [servings_yield, ingredient_count]
`;

describe('config', () => {
  it('defaultVault', () => {
    expect(defaultVault('x')).toBe(path.join(os.homedir(), '.ripcord-vault', 'x'));
  });
  it('loads and resolves composeFile and vault', () => {
    const { d, f } = write(BASE);
    const c = loadConfig(f);
    expect(c.composeFile).toBe(path.resolve(d, 'stack/docker-compose.yml'));
    expect(c.vault).toBe(defaultVault('rclive'));
    expect(c.databases[0]).toEqual({ service: 'postgres', engine: 'postgres', user: 'mealie', db: 'mealie' });
    expect(c.checks[0].read).toEqual(['servings_yield', 'ingredient_count']);
    expect(c.loginVars).toEqual({ email: 'MEALIE_EMAIL' });
  });
  it('round trips through writeConfig', () => {
    const { d, f } = write(BASE);
    const c = loadConfig(f);
    const f2 = path.join(d, 'sub', 'ripcord.yml');
    writeConfig(f2, c);
    expect(loadConfig(f2)).toEqual(c);
  });

  const bad: [string, (s: string) => string, RegExp][] = [
    ['missing project', (s) => s.replace('project: rclive\n', ''), /"project" is required/],
    ['bad url', (s) => s.replace('http://localhost:9925', 'localhost'), /"appUrl"/],
    ['ftp url', (s) => s.replace('http://localhost:9925', 'ftp://x'), /"appUrl"/],
    ['missing appService', (s) => s.replace('appService: mealie\n', ''), /"appService" is required/],
    ['bad engine', (s) => s.replace('engine: postgres', 'engine: mysql'), /databases\[0\]\.engine/],
    ['sqlite without path', (s) => s.replace('engine: postgres', 'engine: sqlite'), /databases\[0\]\.path/],
    ['relative vault', (s) => s + '\nvault: rel/path\n', /"vault"/],
    ['no checks', (s) => s.replace(/checks:[\s\S]*$/, 'checks: []\n'), /"checks"/],
    ['check without id', (s) => s.replace('  - id: recipe\n    ask', '  - ask'), /checks\[0\]\.id/],
    ['check without read', (s) => s.replace('read: [servings_yield, ingredient_count]', 'read: []'), /checks\[0\]\.read/],
    ['non snake_case read', (s) => s.replace('servings_yield', 'Servings Yield'), /checks\[0\]\.read\[0\]/],
    ['loginVars value', (s) => s.replace('MEALIE_EMAIL', '5'), /loginVars\.email/],
    ['volumes not list', (s) => s.replace('volumes: [mealie-data]', 'volumes: nope'), /"volumes"/],
  ];
  for (const [name, mut, re] of bad) {
    it(`rejects ${name}`, () => {
      const { f } = write(mut(BASE));
      expect(() => loadConfig(f)).toThrow(re);
    });
  }

  it('rejects duplicate check ids', () => {
    const { f } = write(BASE + '  - id: recipe\n    ask: x\n    read: [a]\n');
    expect(() => loadConfig(f)).toThrow(/used twice/);
  });
  it('rejects missing file and bad yaml', () => {
    expect(() => loadConfig(path.join(tmp(), 'nope.yml'))).toThrow(/cannot read/);
    const { f } = write('a: [');
    expect(() => loadConfig(f)).toThrow(/invalid YAML/);
  });
});
