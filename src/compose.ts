import YAML from 'yaml';
import type { DatabaseSpec } from './types.js';

export interface ComposePort { host: number | null; container: number }
export interface ComposeVolume { source: string; target: string; kind: 'named' | 'bind' }
export interface ComposeService {
  name: string;
  image: string;
  ports: ComposePort[];
  volumes: ComposeVolume[];
  environment: Record<string, string>;
}
export interface ParsedCompose { services: ComposeService[]; namedVolumes: string[] }

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ${VAR:-default} and ${VAR-default} resolve to the default; an unset ${VAR} resolves to ''.
function resolveVars(s: string): string {
  return s.replace(/\$\{[^}:-]+(?::?-([^}]*))?\}/g, (_m, def) => def ?? '');
}

function toPort(s: string): number | null {
  const m = /^\d+/.exec(resolveVars(s).trim());
  return m ? Number(m[0]) : null;
}

function parsePort(p: unknown): ComposePort | null {
  if (typeof p === 'number') return { host: null, container: p };
  if (typeof p === 'string') {
    const noProto = p.split('/')[0];
    const parts: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of noProto) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      if (ch === ':' && depth === 0) {
        parts.push(cur);
        cur = '';
      } else cur += ch;
    }
    parts.push(cur);
    const container = toPort(parts[parts.length - 1]);
    if (container === null) return null;
    if (parts.length === 1) return { host: null, container };
    return { host: toPort(parts[parts.length - 2]), container };
  }
  if (isObj(p)) {
    const container = typeof p.target === 'number' ? p.target : toPort(String(p.target ?? ''));
    if (container === null) return null;
    const pub = p.published;
    const host = pub === undefined || pub === null ? null : typeof pub === 'number' ? pub : toPort(String(pub));
    return { host, container };
  }
  return null;
}

function isBindSource(src: string): boolean {
  return /^[./~\\]/.test(src) || /[/\\]/.test(src) || /^[a-zA-Z]:/.test(src);
}

function parseVolume(v: unknown): ComposeVolume | null {
  if (typeof v === 'string') {
    let rest = v;
    let drive = '';
    const dm = /^([a-zA-Z]:[\\/])/.exec(rest);
    if (dm) {
      drive = dm[1];
      rest = rest.slice(dm[1].length);
    }
    const parts = rest.split(':');
    if (parts.length < 2) return null; // anonymous volume
    const source = drive + parts[0];
    return { source, target: parts[1], kind: isBindSource(source) ? 'bind' : 'named' };
  }
  if (isObj(v)) {
    const source = typeof v.source === 'string' ? v.source : '';
    const target = typeof v.target === 'string' ? v.target : '';
    if (!target || !source) return null; // anonymous or tmpfs
    if (v.type === 'bind') return { source, target, kind: 'bind' };
    if (v.type === 'volume') return { source, target, kind: 'named' };
    return null;
  }
  return null;
}

function parseEnv(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(e)) {
    for (const item of e) {
      if (typeof item !== 'string') continue;
      const i = item.indexOf('=');
      if (i < 0) out[item] = '';
      else out[item.slice(0, i)] = item.slice(i + 1);
    }
  } else if (isObj(e)) {
    for (const [k, v] of Object.entries(e)) out[k] = v === null || v === undefined ? '' : String(v);
  }
  return out;
}

export function parseCompose(yamlText: string): ParsedCompose {
  const doc = YAML.parse(yamlText);
  if (!isObj(doc)) throw new Error('compose file must be a YAML mapping');
  const servicesRaw = isObj(doc.services) ? doc.services : {};
  const services: ComposeService[] = [];
  for (const [name, sv] of Object.entries(servicesRaw)) {
    const s = isObj(sv) ? sv : {};
    const ports = (Array.isArray(s.ports) ? s.ports : [])
      .map(parsePort)
      .filter((x): x is ComposePort => x !== null);
    const volumes = (Array.isArray(s.volumes) ? s.volumes : [])
      .map(parseVolume)
      .filter((x): x is ComposeVolume => x !== null);
    services.push({
      name,
      image: typeof s.image === 'string' ? s.image : '',
      ports,
      volumes,
      environment: parseEnv(s.environment),
    });
  }
  const namedVolumes = isObj(doc.volumes) ? Object.keys(doc.volumes) : [];
  return { services, namedVolumes };
}

function isPostgres(image: string): boolean {
  return image.toLowerCase().includes('postgres');
}

export function detectDatabases(parsed: ParsedCompose): DatabaseSpec[] {
  const out: DatabaseSpec[] = [];
  for (const s of parsed.services) {
    if (!isPostgres(s.image)) continue;
    const user = s.environment.POSTGRES_USER || 'postgres';
    out.push({
      service: s.name,
      engine: 'postgres',
      user,
      // Postgres itself defaults the database name to the user name
      db: s.environment.POSTGRES_DB || user,
    });
  }
  return out;
}

export function guessAppService(parsed: ParsedCompose): string | null {
  const s = parsed.services.find((x) => !isPostgres(x.image) && x.ports.some((p) => p.host !== null));
  return s ? s.name : null;
}
