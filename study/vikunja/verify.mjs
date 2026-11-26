// API level look (no browser agent). Usage: node verify.mjs <baseUrl>
import crypto from 'node:crypto';
const BASE = process.argv[2]; const out = { base: BASE };
try { out.http_info = (await fetch(BASE + '/api/v1/info')).status; } catch (e) { out.http_info = 'ERR ' + e.message; console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const lr = await fetch(BASE + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'study', password: 'StudyPass123!' }) });
out.login_status = lr.status;
if (!lr.ok) { out.login_body = (await lr.text()).slice(0, 200); console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const H = { Authorization: 'Bearer ' + (await lr.json()).token };
const projects = await (await fetch(BASE + '/api/v1/projects', { headers: H })).json();
out.projects = projects.map(p => p.title);
const all = await (await fetch(BASE + '/api/v1/projects/2/tasks?per_page=50', { headers: H })).json().catch(() => null);
out.task_titles = Array.isArray(all) ? all.map(t => t.title).sort() : all;
const tr = await fetch(BASE + '/api/v1/tasks/2', { headers: H }); out.task2_status = tr.status;
if (tr.ok) {
  const t = await tr.json(); out.task2_title = t.title; out.task2_attachments = (t.attachments || []).map(a => ({ id: a.id, name: a.file?.name, size: a.file?.size }));
  out.downloads = [];
  for (const a of t.attachments || []) {
    const d = await fetch(`${BASE}/api/v1/tasks/2/attachments/${a.id}`, { headers: H }); const b = Buffer.from(await d.arrayBuffer());
    const pv = await fetch(`${BASE}/api/v1/tasks/2/attachments/${a.id}?preview_size=md`, { headers: H }); const pb = Buffer.from(await pv.arrayBuffer());
    out.downloads.push({ name: a.file?.name, status: d.status, type: d.headers.get('content-type'), bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex').slice(0, 16), preview_status: pv.status, preview_bytes: pb.length, body_start: d.ok ? undefined : b.toString().slice(0, 150) });
  }
}
console.log(JSON.stringify(out, null, 1));
