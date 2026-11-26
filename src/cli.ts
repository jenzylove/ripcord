#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { ProofReport, RipcordConfig } from './types.js';
import { defaultVault, loadConfig, writeConfig } from './config.js';
import { parseCompose, detectDatabases, guessAppService } from './compose.js';
import { createBackup } from './backup.js';
import { prove, verify } from './prove.js';
import { classifyCommand, guardDecision } from './hook.js';
import { readState, updateState } from './state.js';
import { rollback } from './rollback.js';

const program = new Command();
program.name('ripcord').description('Prove your data comes back before your AI agent can destroy it.').version('0.1.0');
const cfgOpt = (c: Command) => c.option('-c, --config <path>', 'path to ripcord.yml', 'ripcord.yml');

function lastReport(projectDir: string): ProofReport | null {
  const dir = join(projectDir, '.ripcord', 'reports');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.startsWith('proof-') && f.endsWith('.json')).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const r = JSON.parse(readFileSync(join(dir, files[i]), 'utf8')) as ProofReport;
    if (r.verdict === 'PROVEN' && r.backupId !== 'external') return r;
  }
  return null;
}

program
  .command('init')
  .description('read docker-compose.yml and write ripcord.yml')
  .option('-f, --compose <path>', 'compose file', 'docker-compose.yml')
  .option('-p, --project <name>', 'compose project name of the live stack')
  .option('-u, --url <url>', 'live app URL')
  .action((o) => {
    if (existsSync('ripcord.yml')) { console.error('ripcord.yml already exists.'); process.exit(1); }
    const parsed = parseCompose(readFileSync(o.compose, 'utf8'));
    const app = guessAppService(parsed) ?? parsed.services[0]?.name ?? 'app';
    const svc = parsed.services.find((s) => s.name === app);
    const port = svc?.ports.find((p) => p.host)?.host;
    const project = o.project ?? (process.env.COMPOSE_PROJECT_NAME || resolve('.').split(/[\\/]/).pop()!.toLowerCase());
    const cfg: RipcordConfig = {
      project,
      composeFile: o.compose,
      appUrl: o.url ?? (port ? `http://localhost:${port}` : 'http://localhost:8080'),
      appService: app,
      loginVars: { email: 'RIPCORD_EMAIL', password: 'RIPCORD_PASSWORD' },
      databases: detectDatabases(parsed),
      volumes: parsed.namedVolumes,
      vault: defaultVault(project),
      checks: [
        { id: 'latest_item', ask: 'Log in with email {{email}} and password {{password}}. Open the most recently created item and report its title exactly as displayed. (Tip: give Kane fixed answers, e.g. Answer YES or NO, or digits only, so live and copy readings compare cleanly.)', read: ['latest_item_title'] },
      ],
    };
    writeConfig('ripcord.yml', cfg);
    console.log(`Wrote ripcord.yml for project "${project}": app ${cfg.appService} at ${cfg.appUrl}, ${cfg.databases.length} database(s), ${cfg.volumes.length} volume(s).`);
    console.log('Edit the checks to describe what your users must find after a restore, set RIPCORD_EMAIL and RIPCORD_PASSWORD, then run `ripcord prove`.');
  });

cfgOpt(program.command('backup').description('back up databases and volumes into the vault')).action(async (o) => {
  const cfg = loadConfig(o.config);
  const m = await createBackup(cfg);
  updateState(dirname(resolve(o.config)), { lastBackup: { id: m.id, at: new Date().toISOString() } });
  console.log(`Backup ${m.id}: ${m.files.map((f) => `${f.name} (${f.bytes} bytes)`).join(', ')}`);
});

cfgOpt(program.command('prove').description('back up, restore a throwaway copy, and have Kane check it as your user'))
  .option('--keep', 'keep the restored copy running')
  .option('--copy-url <url>', 'compare against an already restored copy instead of making one')
  .option('--label <text>', 'label for an external copy')
  .action(async (o) => {
    const { report } = await prove({ configPath: o.config, keepCopy: o.keep, copyUrl: o.copyUrl, label: o.label });
    process.exit(report.verdict === 'PROVEN' ? 0 : report.verdict === 'LOSS' ? 1 : 3);
  });

cfgOpt(program.command('verify').description('Kane rereads the live app and compares with the last proven state')).action(async (o) => {
  const dir = dirname(resolve(o.config));
  const last = lastReport(dir);
  if (!last) { console.error('No PROVEN report yet. Run `ripcord prove` first.'); process.exit(3); }
  const { verdict, differences } = await verify(o.config, last);
  if (verdict === 'PROVEN') { console.log('Live app still shows everything from the last proof.'); process.exit(0); }
  console.log(`${verdict === 'LOSS' ? 'DATA CHANGED OR MISSING' : 'INCONCLUSIVE'} since proof ${last.id}:`);
  for (const d of differences) console.log(`  ${d.id}.${d.key}: proven "${d.live}" now "${d.copy}"`);
  if (verdict === 'LOSS') console.log(`If this was not intended, run: ripcord rollback (restores backup ${last.backupId}).`);
  process.exit(verdict === 'LOSS' ? 1 : 3);
});

cfgOpt(program.command('rollback').description('restore the last proven backup into the live stack, then Kane verifies')).option('--yes', 'confirm').action(async (o) => {
  if (!o.yes) { console.error('Rollback replaces live data. Rerun with --yes.'); process.exit(1); }
  const dir = dirname(resolve(o.config));
  const last = lastReport(dir);
  if (!last) { console.error('No PROVEN backup to roll back to.'); process.exit(3); }
  await rollback(o.config, last);
});

// Claude Code hook entry. Reads the hook JSON on stdin. Exit 2 blocks (PreToolUse) or tells the agent what to do next (PostToolUse).
cfgOpt(program.command('guard').description('Claude Code hook: hold destructive commands until a proof exists')).option('--post', 'PostToolUse mode').action((o) => {
  let input: any = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* not JSON: nothing to judge */ }
  const tool = String(input.tool_name ?? '');
  const ti = input.tool_input ?? {};
  // file tools: Ripcord's own state, config, hooks and the vault are off limits to the agent
  const filePath = String(ti.file_path ?? ti.notebook_path ?? '').replace(/\\/g, '/').toLowerCase();
  if (filePath && !o.post) {
    if (/(\/|^)\.ripcord\/|ripcord\.ya?ml$|\.claude\/settings|ripcord-vault/.test(filePath)) {
      console.error(`Ripcord blocked this edit: ${filePath} is Ripcord's own state, config, hooks or vault, which the agent may not change. (tool: ${tool})`);
      process.exit(2);
    }
    process.exit(0);
  }
  const cmd = String(ti.command ?? ti.query ?? ti.sql ?? ti.statement ?? ti.script ?? '');
  if (!cmd) process.exit(0);
  // find ripcord.yml from the hook's working directory upwards, so `cd sub` does not switch the guard off
  let cfgPath = resolve(String(input.cwd ?? process.cwd()), o.config);
  for (let d = dirname(cfgPath); !existsSync(cfgPath); ) {
    const up = dirname(d);
    if (up === d) break;
    d = up;
    cfgPath = join(d, 'ripcord.yml');
  }
  if (!existsSync(cfgPath)) process.exit(0);
  let cfg: RipcordConfig;
  try { cfg = loadConfig(cfgPath); } catch (e) {
    // fail closed: if the config cannot be read, destructive commands are held
    if (classifyCommand(cmd, '').destructive) { console.error(`Ripcord blocked this destructive command: ripcord.yml could not be read (${(e as Error).message}).`); process.exit(2); }
    process.exit(0);
  }
  const dir = dirname(cfgPath);
  const c = classifyCommand(cmd, cfg.vault);
  if (o.post) {
    if (c.destructive) {
      console.error(`Ripcord: "${cmd.slice(0, 120)}" (${c.reason}) just ran. Run \`ripcord verify\` now so Kane checks the live app still shows your users' data.`);
      process.exit(2);
    }
    process.exit(0);
  }
  if (process.env.RIPCORD_ALLOW === '1' && !c.touchesVault) {
    updateState(dir, { lastRiskyCommand: { command: cmd, at: new Date().toISOString(), allowed: true } });
    process.exit(0);
  }
  let st;
  try { st = readState(dir); } catch { st = {}; }
  const d = guardDecision(c, st, new Date());
  if (c.destructive || c.touchesVault) updateState(dir, { lastRiskyCommand: { command: cmd, at: new Date().toISOString(), allowed: d.allow } });
  if (!d.allow) { console.error(`${d.message} (tool: ${tool})`); process.exit(2); }
  process.exit(0);
});

program
  .command('hook')
  .argument('<action>', 'install')
  .description('install the Claude Code hooks in .claude/settings.json')
  .action((action) => {
    if (action !== 'install') { console.error('Only `ripcord hook install` is supported.'); process.exit(1); }
    const file = join('.claude', 'settings.json');
    mkdirSync('.claude', { recursive: true });
    const s = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    s.hooks = s.hooks ?? {};
    const entry = (post: boolean) => ({ matcher: 'Bash|PowerShell|Edit|Write|MultiEdit|NotebookEdit|mcp__.*', hooks: [{ type: 'command', command: `ripcord guard${post ? ' --post' : ''}` }] });
    s.hooks.PreToolUse = [...(s.hooks.PreToolUse ?? []).filter((h: any) => !JSON.stringify(h).includes('ripcord guard')), entry(false)];
    s.hooks.PostToolUse = [...(s.hooks.PostToolUse ?? []).filter((h: any) => !JSON.stringify(h).includes('ripcord guard')), entry(true)];
    writeFileSync(file, JSON.stringify(s, null, 2));
    console.log(`Installed Ripcord hooks in ${file}. Destructive commands now wait for a PROVEN backup.`);
  });

cfgOpt(program.command('fix').description('on LOSS, let Claude Code fix ripcord.yml and prove again (max 3 rounds)')).action(async (o) => {
  const checksBefore = JSON.stringify(loadConfig(o.config).checks);
  for (let round = 1; round <= 4; round++) {
    const { report, files } = await prove({ configPath: o.config });
    if (report.verdict === 'PROVEN') { console.log(`PROVEN after ${round - 1} fix round(s).`); process.exit(0); }
    if (round === 4) break;
    if (report.verdict !== 'LOSS') { console.log('INCONCLUSIVE: not handing this to the agent; check Kane runs first.'); process.exit(3); }
    const prompt = [
      `Ripcord restored a backup of this app into a throwaway copy and Kane (a browser testing agent) found that a user would lose data.`,
      `Differences (live vs restored copy): ${JSON.stringify(report.differences)}`,
      `Kane's summaries: ${report.checks.map((c) => `${c.id}: live: ${c.liveRun?.summary} | copy: ${c.copyRun?.summary}`).join(' || ')}`,
      `Row counts: ${report.rowCountVerdict}. Report file: ${files.json}`,
      `Read ${o.config} and the compose file it points to. Edit ONLY ${o.config} so the backup includes whatever is missing (for example a named volume, or a database). Do not touch application code or any other file. Explain the change in one sentence.`,
    ].join('\n');
    console.log(`Fix round ${round}: asking Claude Code to fix ${o.config}...`);
    const r = spawnSync('claude', ['-p', '--permission-mode', 'acceptEdits', '--allowedTools', 'Read,Edit,Glob', '--output-format', 'text'], { input: prompt, stdio: ['pipe', 'pipe', 'inherit'], encoding: 'utf8', shell: process.platform === 'win32' });
    console.log(r.stdout?.trim());
    // the agent may change what is backed up, never what is checked
    let after = '';
    try { after = JSON.stringify(loadConfig(o.config).checks); } catch (e) { console.log(`ripcord.yml is invalid after the fix: ${(e as Error).message}`); process.exit(1); }
    if (after !== checksBefore) { console.log('The agent changed the checks in ripcord.yml. That is not allowed; stopping.'); process.exit(1); }
  }
  console.log('Still not PROVEN after 3 rounds.');
  process.exit(1);
});

program.parseAsync(process.argv).catch((e) => { console.error(`ripcord: ${(e as Error).message}`); process.exit(1); });
