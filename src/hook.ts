import type { Classified, State } from './types.js';

function unq(t: string): string {
  return t.replace(/^["'`]+|["'`;)]+$/g, '');
}

// Split a command line into segments at && || ; | and newlines, but not inside quotes.
function segments(cmd: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (q) {
      cur += ch;
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      q = ch;
      cur += ch;
      continue;
    }
    if (ch === ';' || ch === '\n' || ch === '|' || ch === '&') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

const DATA_MARKERS = ['data', 'volumes', 'uploads', 'pgdata'];

function rmTargetsData(seg: string, vault: string): string | null {
  const m = /(^|\s)rm\s+(.*)$/.exec(seg);
  if (!m) return null;
  const tokens = m[2].split(/\s+/).filter(Boolean);
  const flags = tokens.filter((t) => t.startsWith('-'));
  const recursive = flags.some((f) => /^-[a-z]*r[a-z]*$/.test(f) || f === '--recursive');
  if (!recursive) return null;
  for (const raw of tokens) {
    if (raw.startsWith('-')) continue;
    const p = unq(raw).replace(/\\/g, '/');
    if (vault && p.includes(vault)) return `rm -rf of the backup vault (${p})`;
    if (DATA_MARKERS.some((d) => p.includes(d)) || /(^|[^a-z])db($|[^a-z])/.test(p)) {
      return `rm -rf of a data path (${p})`;
    }
  }
  return null;
}

function deleteWithoutWhere(s: string): boolean {
  const re = /delete\s+from\b([^;]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (!/\bwhere\b/.test(m[1])) return true;
  }
  return false;
}

function classifySegment(seg: string, vault: string): string | null {
  // git and npm are never destructive for our purposes (commit messages may mention SQL)
  if (/^(git|npm)\b/.test(seg)) return null;

  if (/\bdrop\s+(table|database|schema)\b/.test(seg)) return 'SQL DROP statement';
  if (/\btruncate\b/.test(seg)) return 'TRUNCATE';
  if (deleteWithoutWhere(seg)) return 'DELETE FROM without WHERE';
  if (/\bprisma\s+migrate\s+reset\b/.test(seg)) return 'prisma migrate reset';
  if (/\bprisma\s+db\s+push\b/.test(seg) && /--(accept-data-loss|force-reset)\b/.test(seg)) {
    return 'prisma db push that accepts data loss';
  }
  if (/\bdrizzle-kit\s+push\b/.test(seg) && /--force\b/.test(seg)) return 'drizzle-kit push --force';
  if (/\bsupabase\s+db\s+reset\b/.test(seg)) return 'supabase db reset';
  if (/\b(rails|rake)\s+db:(drop|reset|schema:load)\b/.test(seg) || /\bdb:(drop|reset|schema:load)\b/.test(seg)) {
    return 'rails db:drop/reset/schema:load';
  }
  if (/(manage\.py|django-admin(\.py)?)\s+flush\b/.test(seg)) return 'django flush';
  if (/\bdocker([ -])compose\b/.test(seg) && /\bdown\b/.test(seg) && /(\s-[a-z]*v[a-z]*\b|\s--volumes\b)/.test(seg)) {
    return 'docker compose down with volumes';
  }
  if (/\bdocker\s+volume\s+(rm|remove|prune)\b/.test(seg)) return 'docker volume removal';
  if (/\bdocker\s+system\s+prune\b/.test(seg) && /--volumes\b/.test(seg)) return 'docker system prune --volumes';
  if (/\brailway\s+volume\s+delete\b/.test(seg)) return 'railway volume delete';
  if (/\bdropdb\b/.test(seg)) return 'dropdb';
  return rmTargetsData(seg, vault);
}

export function classifyCommand(cmd: string, vaultPath: string): Classified {
  const lower = cmd.toLowerCase();
  const slash = (s: string) => s.toLowerCase().replace(/\\/g, '/');
  const vault = vaultPath ? slash(vaultPath).replace(/\/+$/, '') : '';
  const touchesVault = vault !== '' && slash(cmd).includes(vault);

  let reason = '';
  for (const seg of segments(lower)) {
    const r = classifySegment(slash(seg), vault);
    if (r) {
      reason = r;
      break;
    }
  }
  return {
    destructive: reason !== '',
    touchesVault,
    reason: reason || (touchesVault ? 'command touches the Ripcord backup vault' : ''),
  };
}

export function guardDecision(
  c: Classified,
  state: State,
  now: Date,
  opts?: { maxProofAgeHours?: number },
): { allow: boolean; message: string } {
  const maxH = opts?.maxProofAgeHours ?? 24;
  if (c.touchesVault) {
    return {
      allow: false,
      message: 'Ripcord blocked this command: it touches the backup vault, which agents may never modify. The vault is what makes recovery possible.',
    };
  }
  if (!c.destructive) return { allow: true, message: 'allowed: not destructive' };

  const proof = state.lastProof;
  const backup = state.lastBackup;
  const next = 'Run `ripcord prove`, then retry this command.';
  const head = `Ripcord blocked this destructive command (${c.reason}).`;
  if (!backup) return { allow: false, message: `${head} No backup exists yet. Run \`ripcord backup\` and then \`ripcord prove\`.` };
  if (!proof) return { allow: false, message: `${head} Your backup has never been proven restorable. ${next}` };
  if (proof.verdict !== 'PROVEN') {
    return { allow: false, message: `${head} The last proof was ${proof.verdict}, not PROVEN. Fix what is missing from the backup, then run \`ripcord prove\`.` };
  }
  if (proof.backupId !== backup.id) {
    return { allow: false, message: `${head} The last proof covers backup ${proof.backupId}, but the latest backup is ${backup.id}. ${next}` };
  }
  const age = now.getTime() - new Date(proof.at).getTime();
  if (!Number.isFinite(age)) return { allow: false, message: `${head} The proof timestamp is unreadable. ${next}` };
  if (age > maxH * 3600_000) {
    const hrs = Math.floor(age / 3600_000);
    return { allow: false, message: `${head} The last proof is ${hrs} hours old (limit ${maxH}). ${next}` };
  }
  return { allow: true, message: `allowed: backup ${backup.id} is PROVEN restorable` };
}
