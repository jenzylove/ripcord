// Seeds a running Vikunja through its real API. Usage: node seed.mjs [baseUrl]  (default http://localhost:9962)
import zlib from 'node:zlib';
// User study / study@example.com / StudyPass123!, project "Launch Plan" with 5 tasks, one with a file attachment (a generated PNG, venue-floorplan.png).
const BASE = process.argv[2] || 'http://localhost:9962';
const USER = 'study', EMAIL = 'study@example.com', PASSWORD = 'StudyPass123!';
// --- tiny PNG encoder: a solid colour with a diagonal stripe, so each photo is a real, distinct picture
function crc32(buf){let c,crc=~0;for(let n=0;n<buf.length;n++){c=(crc^buf[n])&0xff;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crc=(crc>>>8)^c;}return ~crc>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc]);}
function png(w,h,[r,g,b],[r2,g2,b2]){const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;for(let x=0;x<w;x++){const s=((x+y)%60)<20;const o=y*(w*3+1)+1+x*3;raw[o]=s?r2:r;raw[o+1]=s?g2:g;raw[o+2]=s?b2:b;}}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}

async function api(method, path, { token, json, form } = {}) {
  const headers = {}; if (token) headers.Authorization = `Bearer ${token}`;
  let body; if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); } if (form) body = form;
  const res = await fetch(BASE + '/api/v1' + path, { method, headers, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}
try { await api('POST', '/register', { json: { username: USER, email: EMAIL, password: PASSWORD } }); } catch (e) { if (!/exist|taken|1005|1008/i.test(e.message)) console.error('register:', e.message); }
const { token } = await api('POST', '/login', { json: { username: USER, password: PASSWORD } });
const project = await api('PUT', '/projects', { token, json: { title: 'Launch Plan', description: 'Study seed project' } });
const titles = ['Write press release', 'Book venue', 'Order printed banners', 'Invite beta users', 'Prepare demo script'];
const tasks = [];
for (const [i, title] of titles.entries()) {
  tasks.push(await api('PUT', `/projects/${project.id}/tasks`, { token, json: { title, description: `Task ${i + 1} of the launch plan`, priority: (i % 5) + 1 } }));
}
const attTask = tasks[1]; // "Book venue"
const text = 'Venue contract\nHall A, capacity 120, deposit 500 USD\nSigned copy ref VC-2026-1125\n'.repeat(20);
const form = new FormData();
form.append('files', new Blob([png(400, 300, [30, 90, 160], [240, 200, 40])], { type: 'image/png' }), 'venue-floorplan.png');
const att = await api('PUT', `/tasks/${attTask.id}/attachments`, { token, form });
console.log(JSON.stringify({ app: 'vikunja', base: BASE, login: { username: USER, email: EMAIL, password: PASSWORD }, project: { id: project.id, title: project.title },
  tasks: tasks.map(t => ({ id: t.id, title: t.title })), attachment: { task: attTask.title, taskId: attTask.id, result: att.success?.map(s => ({ name: s.file?.name, size: s.file?.size })) ?? att } }, null, 2));
