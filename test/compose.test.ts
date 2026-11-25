import { describe, it, expect } from 'vitest';
import { parseCompose, detectDatabases, guessAppService } from '../src/compose.js';

const SHORT = `
services:
  mealie:
    image: ghcr.io/mealie-recipes/mealie:v1
    ports:
      - "9925:9000"
    volumes:
      - mealie-data:/app/data
      - ./config:/config:ro
    environment:
      BASE_URL: http://localhost:9925
      DB_ENGINE: postgres
  postgres:
    image: postgres:16
    environment:
      - POSTGRES_USER=mealie
      - POSTGRES_PASSWORD=secret
      - POSTGRES_DB=mealie_db
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  mealie-data:
  pgdata:
`;

const LONG = `
services:
  web:
    image: nginx
    ports:
      - target: 80
        published: 8080
        protocol: tcp
      - "127.0.0.1:8443:443"
      - "3000"
      - 5000
      - "\${PORT:-9100}:80/tcp"
    volumes:
      - type: volume
        source: webdata
        target: /data
      - type: bind
        source: ./site
        target: /usr/share/nginx/html
      - type: tmpfs
        target: /tmp
      - /anon
  db:
    image: postgres
volumes:
  webdata: {}
`;

describe('parseCompose', () => {
  it('short syntax and env list/map', () => {
    const p = parseCompose(SHORT);
    expect(p.namedVolumes).toEqual(['mealie-data', 'pgdata']);
    const m = p.services.find((s) => s.name === 'mealie')!;
    expect(m.ports).toEqual([{ host: 9925, container: 9000 }]);
    expect(m.volumes).toEqual([
      { source: 'mealie-data', target: '/app/data', kind: 'named' },
      { source: './config', target: '/config', kind: 'bind' },
    ]);
    expect(m.environment.DB_ENGINE).toBe('postgres');
    const pg = p.services.find((s) => s.name === 'postgres')!;
    expect(pg.environment).toEqual({ POSTGRES_USER: 'mealie', POSTGRES_PASSWORD: 'secret', POSTGRES_DB: 'mealie_db' });
  });
  it('long syntax and odd ports', () => {
    const w = parseCompose(LONG).services[0];
    expect(w.ports).toEqual([
      { host: 8080, container: 80 },
      { host: 8443, container: 443 },
      { host: null, container: 3000 },
      { host: null, container: 5000 },
      { host: 9100, container: 80 },
    ]);
    expect(w.volumes).toEqual([
      { source: 'webdata', target: '/data', kind: 'named' },
      { source: './site', target: '/usr/share/nginx/html', kind: 'bind' },
    ]);
  });
  it('windows drive bind mount', () => {
    const p = parseCompose('services:\n  a:\n    image: x\n    volumes:\n      - "C:\\\\stuff:/win"\n');
    expect(p.services[0].volumes).toEqual([{ source: 'C:\\stuff', target: '/win', kind: 'bind' }]);
  });
  it('no services', () => {
    expect(parseCompose('version: "3"')).toEqual({ services: [], namedVolumes: [] });
  });
  it('rejects non mapping', () => {
    expect(() => parseCompose('- a')).toThrow();
  });
});

describe('detectDatabases and guessAppService', () => {
  it('postgres with env', () => {
    expect(detectDatabases(parseCompose(SHORT))).toEqual([
      { service: 'postgres', engine: 'postgres', user: 'mealie', db: 'mealie_db' },
    ]);
  });
  it('postgres defaults', () => {
    expect(detectDatabases(parseCompose(LONG))).toEqual([
      { service: 'db', engine: 'postgres', user: 'postgres', db: 'postgres' },
    ]);
  });
  it('sqlite cannot be detected', () => {
    expect(detectDatabases(parseCompose('services:\n  a:\n    image: mealie\n    ports: ["1:2"]'))).toEqual([]);
  });
  it('guesses the first non db service with a host port', () => {
    expect(guessAppService(parseCompose(SHORT))).toBe('mealie');
    expect(guessAppService(parseCompose('services:\n  db:\n    image: postgres\n    ports: ["5432:5432"]'))).toBeNull();
  });
});
