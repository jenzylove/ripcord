import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { copyUrl, countPublishedPorts, remapPortEntry, rewriteCompose } from '../src/restore.js';
import { backupId, postgresDataVolumes, realVolumeName } from '../src/backup.js';
import { compareRowCounts, parseCounts } from '../src/rowcount.js';
import { destroyCopy } from '../src/restore.js';

const COMPOSE = `
name: live
services:
  mealie:
    container_name: mealie_live
    restart: unless-stopped
    ports: ["9925:9000", "127.0.0.1:8080:80/tcp", "3000"]
    volumes: ["mealie-data:/app/data/"]
  postgres:
    image: postgres:17-alpine
    volumes: ["mealie-pgdata:/var/lib/postgresql/data"]
    ports:
      - target: 5432
        published: 5544
volumes:
  mealie-data:
  mealie-pgdata:
    name: shared_pgdata
`;

describe('port remapping', () => {
  it('rewrites short and long forms, leaves container only ports', () => {
    expect(remapPortEntry('9925:9000', 9930)).toEqual({ entry: '9930:9000', oldHost: 9925 });
    expect(remapPortEntry('127.0.0.1:8080:80/tcp', 9931)).toEqual({ entry: '127.0.0.1:9931:80/tcp', oldHost: 8080 });
    expect(remapPortEntry('3000', 9932).oldHost).toBeNull();
    expect(remapPortEntry({ target: 5432, published: 5544 }, 9933).entry).toEqual({ target: 5432, published: '9933' });
  });
  it('counts published ports', () => {
    expect(countPublishedPorts(COMPOSE)).toBe(3);
  });
});

describe('compose rewrite', () => {
  const r = rewriteCompose(COMPOSE, { freePorts: [9930, 9931, 9932], appService: 'mealie', liveAppPort: 9925 });
  const doc = parse(r.text);
  it('remaps ports in order and reports the app port', () => {
    expect(doc.services.mealie.ports).toEqual(['9930:9000', '127.0.0.1:9931:80/tcp', '3000']);
    expect(r.ports.mealie).toBe(9930);
    expect(r.ports.postgres).toBe(9932);
  });
  it('drops names that would collide with the live stack', () => {
    expect(doc.name).toBeUndefined();
    expect(doc.services.mealie.container_name).toBeUndefined();
    expect(doc.services.mealie.restart).toBeUndefined();
    expect(doc.volumes['mealie-pgdata']).not.toHaveProperty('name');
  });
  it('fails when ports run out', () => {
    expect(() => rewriteCompose(COMPOSE, { freePorts: [9930], appService: 'mealie' })).toThrow();
  });
});

describe('helpers', () => {
  it('real volume name: project prefix unless explicit', () => {
    expect(realVolumeName(COMPOSE, 'rclive', 'mealie-data')).toBe('rclive_mealie-data');
    expect(realVolumeName(COMPOSE, 'rclive', 'mealie-pgdata')).toBe('shared_pgdata');
  });
  it('finds postgres data volumes', () => {
    const s = postgresDataVolumes(COMPOSE, { databases: [{ service: 'postgres', engine: 'postgres', user: 'u', db: 'd' }] });
    expect([...s]).toEqual(['mealie-pgdata']);
  });
  it('backup id is a UTC timestamp', () => {
    expect(backupId(new Date('2026-11-25T15:00:00.123Z'))).toBe('20261125T150000Z');
  });
  it('copy url swaps only the port', () => {
    expect(copyUrl('http://localhost:9925', 9930)).toBe('http://localhost:9930');
    expect(copyUrl('http://localhost:9925/app/', 9930)).toBe('http://localhost:9930/app/');
  });
  it('parses and compares row counts', () => {
    const live = parseCounts('a\t3\nb\t0\nc\t7\n');
    expect(live).toEqual({ a: 3, b: 0, c: 7 });
    const cmp = compareRowCounts(live, { a: 3, b: 0, d: 1 });
    expect(cmp.find((x) => x.table === 'c')).toEqual({ table: 'c', live: 7, copy: -1 });
    expect(cmp.find((x) => x.table === 'a')).toEqual({ table: 'a', live: 3, copy: 3 });
  });
  it('refuses to destroy a non copy project', async () => {
    await expect(destroyCopy({ project: 'rclive', composeFile: 'x.yml' })).rejects.toThrow(/refusing/);
  });
});
