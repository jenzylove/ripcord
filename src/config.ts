import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import type { Check, DatabaseSpec, RipcordConfig } from './types.js';

export function defaultVault(project: string): string {
  return path.join(os.homedir(), '.ripcord-vault', project);
}

function fail(field: string, msg: string): never {
  throw new Error(`ripcord.yml: field "${field}" ${msg}`);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(raw: Record<string, unknown>, field: string, prefix = ''): string {
  const v = raw[field];
  const name = prefix + field;
  if (v === undefined || v === null) fail(name, 'is required');
  if (typeof v !== 'string' || v.trim() === '') fail(name, 'must be a non-empty string');
  return v;
}

function optStr(raw: Record<string, unknown>, field: string, prefix: string): string | undefined {
  const v = raw[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' || v.trim() === '') fail(prefix + field, 'must be a non-empty string');
  return v;
}

function strList(v: unknown, field: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail(field, 'must be a list of strings');
  v.forEach((x, i) => {
    if (typeof x !== 'string' || x.trim() === '') fail(`${field}[${i}]`, 'must be a non-empty string');
  });
  return v as string[];
}

export function loadConfig(file: string): RipcordConfig {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(`ripcord.yml: cannot read ${file}: ${(e as Error).message}`);
  }
  let raw: unknown;
  try {
    raw = YAML.parse(text);
  } catch (e) {
    throw new Error(`ripcord.yml: invalid YAML in ${file}: ${(e as Error).message}`);
  }
  if (!isObj(raw)) throw new Error(`ripcord.yml: ${file} must contain a YAML mapping at the top level`);

  const project = str(raw, 'project');
  const composeRaw = str(raw, 'composeFile');
  const composeFile = path.isAbsolute(composeRaw)
    ? composeRaw
    : path.resolve(path.dirname(path.resolve(file)), composeRaw);
  const appUrl = str(raw, 'appUrl');
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(appUrl);
  } catch {
    fail('appUrl', `must be a valid URL, got "${appUrl}"`);
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    fail('appUrl', 'must start with http:// or https://');
  }
  const appService = str(raw, 'appService');

  let loginVars: Record<string, string> = {};
  if (raw.loginVars !== undefined && raw.loginVars !== null) {
    if (!isObj(raw.loginVars)) fail('loginVars', 'must be a mapping of Kane variable name to env var name');
    for (const [k, v] of Object.entries(raw.loginVars)) {
      if (typeof v !== 'string' || v.trim() === '') fail(`loginVars.${k}`, 'must be the name of an environment variable');
    }
    loginVars = raw.loginVars as Record<string, string>;
  }

  const databases: DatabaseSpec[] = [];
  if (raw.databases !== undefined && raw.databases !== null) {
    if (!Array.isArray(raw.databases)) fail('databases', 'must be a list');
    raw.databases.forEach((d: unknown, i: number) => {
      const p = `databases[${i}].`;
      if (!isObj(d)) fail(`databases[${i}]`, 'must be a mapping');
      const service = str(d, 'service', p);
      const engine = d.engine;
      if (engine !== 'postgres' && engine !== 'sqlite') {
        fail(`${p}engine`, `must be "postgres" or "sqlite", got ${JSON.stringify(engine)}`);
      }
      const spec: DatabaseSpec = { service, engine };
      if (engine === 'postgres') {
        const user = optStr(d, 'user', p);
        const db = optStr(d, 'db', p);
        if (user) spec.user = user;
        if (db) spec.db = db;
      } else {
        const sp = optStr(d, 'path', p);
        if (!sp) fail(`${p}path`, 'is required for engine sqlite');
        spec.path = sp;
      }
      databases.push(spec);
    });
  }

  const volumes = strList(raw.volumes, 'volumes');

  const vault = optStr(raw, 'vault', '') ?? defaultVault(project);
  if (!path.isAbsolute(vault)) fail('vault', `must be an absolute path, got "${vault}"`);

  if (!Array.isArray(raw.checks)) fail('checks', 'is required and must be a list');
  if (raw.checks.length === 0) fail('checks', 'must contain at least one check');
  const seen = new Set<string>();
  const checks: Check[] = raw.checks.map((c: unknown, i: number) => {
    const p = `checks[${i}].`;
    if (!isObj(c)) fail(`checks[${i}]`, 'must be a mapping');
    const id = str(c, 'id', p);
    if (seen.has(id)) fail(`${p}id`, `"${id}" is used twice`);
    seen.add(id);
    const ask = str(c, 'ask', p);
    const read = c.read === undefined ? [] : strList(c.read, `${p}read`);
    const assertText = typeof c.assert === 'string' && c.assert.trim() ? c.assert.trim() : undefined;
    if (read.length === 0 && !assertText) fail(`${p}read`, 'must list at least one value name (or set assert)');
    read.forEach((r, j) => {
      if (!/^[a-z][a-z0-9_]*$/.test(r)) {
        fail(`${p}read[${j}]`, `"${r}" must be snake_case (lower case letters, digits, underscores)`);
      }
    });
    return assertText ? { id, ask, read, assert: assertText } : { id, ask, read };
  });

  return { project, composeFile, appUrl, appService, loginVars, databases, volumes, vault, checks };
}

export function writeConfig(file: string, cfg: RipcordConfig): void {
  const dir = path.dirname(path.resolve(file));
  fs.mkdirSync(dir, { recursive: true });
  // store composeFile relative to the yml so the file stays portable; loadConfig resolves it back
  const rel = path.isAbsolute(cfg.composeFile) ? path.relative(dir, cfg.composeFile) : cfg.composeFile;
  const out: RipcordConfig = { ...cfg, composeFile: (rel || cfg.composeFile).split(path.sep).join('/') };
  fs.writeFileSync(file, YAML.stringify(out), 'utf8');
}
