// Usage: node scripts/session2replay.mjs <session.jsonl> <out.json> <prompt> [extra command logfile ...]
// Turns a real Claude Code stream-json transcript (plus later Ripcord logs) into a replay file.
import { readFileSync, writeFileSync } from 'node:fs';
const [file, out, prompt, ...extra] = process.argv.slice(2);
const lines = [{ text: `$ claude -p "${prompt}"`, wait: 900 }];
const BS = String.fromCharCode(92);
const strip = (s) => s.split(['C:', 'Users', 'LENOVO', 'ripcord', ''].join(BS)).join('').split('C:/Users/LENOVO/ripcord/').join('');
for (const l of readFileSync(file, 'utf8').split('\n')) {
  let e; try { e = JSON.parse(l); } catch { continue; }
  if (e.type === 'assistant') {
    for (const c of e.message.content ?? []) {
      if (c.type === 'tool_use' && c.input?.command) {
        let cmd = c.input.command;
        if (/tasks\/.*\.output/.test(cmd)) continue; // Claude polling its own background task
        cmd = cmd.split('\n')[0].slice(0, 160) + (c.input.command.includes('\n') ? ' ...' : '');
        lines.push({ text: `Claude: ${cmd}`, wait: 900 });
      } else if (c.type === 'text' && c.text.trim()) {
        lines.push({ text: `Claude: ${c.text.trim().split('\n')[0].slice(0, 200)}`, wait: 900 });
      }
    }
  } else if (e.type === 'user') {
    for (const c of e.message.content ?? []) {
      if (c?.type !== 'tool_result') continue;
      let x = typeof c.content === 'string' ? c.content : (c.content ?? []).map((y) => y.text ?? '').join('\n');
      if (/You will be notified when it completes/.test(x)) continue;
      for (const t of strip(x).split('\n').filter((s) => s.trim()).slice(-14)) {
        if (/exited with code|^Shell cwd/.test(t)) continue;
        lines.push({ text: '  ' + t.replace(/^PreToolUse:Bash hook error: \[ripcord guard\]: /, 'HOOK: ').slice(0, 220), wait: /HOOK|PROVEN/.test(t) ? 1400 : 300 });
      }
    }
  }
}
for (let i = 0; i < extra.length; i += 2) {
  lines.push({ text: `$ ${extra[i]}`, wait: 1200 });
  for (const t of strip(readFileSync(extra[i + 1], 'utf8')).split('\n')) {
    if (!t.trim() || /^(verify|rollback) exit/.test(t)) continue;
    lines.push({ text: t, wait: /^\[/.test(t) ? 900 : /ROLLED|DATA CHANGED|PROVEN|LOSS/.test(t) ? 1400 : 350 });
  }
}
writeFileSync(out, JSON.stringify({ title: 'Claude Code meets the Ripcord gate', recordedAt: 'Nov 26 2026, 11:21 UTC', fullLog: 'logs/gate-session.jsonl', lines }, null, 2));
console.log(out, lines.length, 'lines');
